"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Save, Lock, User, Mail, Calendar, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ButtonSpinner } from "@/components/ui/spinner";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Profile form
  const [name, setName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const data = await res.json();
      setUser(data.user);
      setName(data.user.name || "");
    } catch (error) {
      console.error("Failed to fetch user:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleSaveProfile = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error("이름은 2자 이상이어야 합니다.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "저장에 실패했습니다.");
        return;
      }

      toast.success("이름이 변경되었습니다.");
      setUser((prev) => (prev ? { ...prev, name: data.user.name } : prev));
      // Update session name
      await updateSession({ name: data.user.name });
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: user?.hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "비밀번호 변경에 실패했습니다.");
        return;
      }

      toast.success("비밀번호가 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setUser((prev) => (prev ? { ...prev, hasPassword: true } : prev));
    } catch {
      toast.error("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "AUTHOR":
        return "작가";
      case "EDITOR":
        return "윤문가";
      case "ADMIN":
        return "관리자";
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">사용자 정보를 불러올 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <header className="pb-10 border-b border-border mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Settings
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">설정</h1>
        <p className="text-muted-foreground">계정 정보와 보안 설정을 관리하세요</p>
      </header>

      {/* Account Info */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <User className="h-5 w-5" />
          계정 정보
        </h2>

        <div className="space-y-5">
          {/* Email (read-only) */}
          <div>
            <label className="text-sm font-medium mb-2 block flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              이메일
            </label>
            <Input value={user.email} disabled className="bg-muted/50" />
            <p className="text-xs text-muted-foreground mt-1.5">
              이메일은 변경할 수 없습니다
            </p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="settings-name" className="text-sm font-medium mb-2 block">이름</label>
            <div className="flex gap-3">
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름"
              />
              <Button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || name === user.name}
              >
                {isSavingProfile ? <ButtonSpinner /> : <Save className="h-4 w-4 mr-2" />}
                저장
              </Button>
            </div>
          </div>

          {/* Role & Join date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                역할
              </label>
              <div className="h-12 flex items-center">
                <Badge variant="secondary">{getRoleLabel(user.role)}</Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                가입일
              </label>
              <div className="h-12 flex items-center text-sm text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="mb-10 pt-10 border-t border-border">
        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <Lock className="h-5 w-5" />
          비밀번호 변경
        </h2>

        <div className="space-y-4">
          {user.hasPassword && (
            <div>
              <label htmlFor="current-password" className="text-sm font-medium mb-2 block">현재 비밀번호</label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호"
              />
            </div>
          )}

          {!user.hasPassword && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
              <p className="text-sm text-muted-foreground">
                소셜 로그인으로 가입하셨습니다. 비밀번호를 설정하면 이메일로도 로그인할 수 있습니다.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="new-password" className="text-sm font-medium mb-2 block">
              {user.hasPassword ? "새 비밀번호" : "비밀번호 설정"}
            </label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8자 이상 (영문+숫자)"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="text-sm font-medium mb-2 block">비밀번호 확인</label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive mt-1.5">
                비밀번호가 일치하지 않습니다
              </p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={
              isSavingPassword ||
              !newPassword ||
              newPassword !== confirmPassword ||
              (user.hasPassword && !currentPassword)
            }
          >
            {isSavingPassword ? <ButtonSpinner /> : <Lock className="h-4 w-4 mr-2" />}
            {user.hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
          </Button>
        </div>
      </section>
    </div>
  );
}
