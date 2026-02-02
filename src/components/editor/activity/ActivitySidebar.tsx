"use client";

import { ActivityType } from "@prisma/client";
import {
  Activity,
  MessageSquare,
  Check,
  Reply,
  Pencil,
  CheckCircle,
  XCircle,
  RefreshCw,
  Camera,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useActivities, Activity as ActivityItem } from "@/hooks/useActivities";
import { useEditorContext } from "../EditorProvider";
import { cn } from "@/lib/utils";

export function ActivitySidebar() {
  const { work, chapter } = useEditorContext();
  const workId = work?.id ?? "";
  const chapterNum = chapter?.number;

  const { activities, isLoading, hasMore, loadMore, refresh } = useActivities({
    workId,
    chapterNum,
    pollingInterval: 15000, // Poll every 15 seconds
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "방금 전";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case "COMMENT_ADDED":
        return <MessageSquare className="h-3.5 w-3.5" />;
      case "COMMENT_RESOLVED":
        return <Check className="h-3.5 w-3.5" />;
      case "COMMENT_REPLIED":
        return <Reply className="h-3.5 w-3.5" />;
      case "EDIT_MADE":
        return <Pencil className="h-3.5 w-3.5" />;
      case "CHANGE_ACCEPTED":
        return <CheckCircle className="h-3.5 w-3.5" />;
      case "CHANGE_REJECTED":
        return <XCircle className="h-3.5 w-3.5" />;
      case "STATUS_CHANGED":
        return <RefreshCw className="h-3.5 w-3.5" />;
      case "SNAPSHOT_CREATED":
        return <Camera className="h-3.5 w-3.5" />;
      case "SNAPSHOT_RESTORED":
        return <RotateCcw className="h-3.5 w-3.5" />;
      default:
        return <Activity className="h-3.5 w-3.5" />;
    }
  };

  const getActivityColor = (type: ActivityType) => {
    switch (type) {
      case "COMMENT_ADDED":
      case "COMMENT_REPLIED":
        return "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
      case "COMMENT_RESOLVED":
      case "CHANGE_ACCEPTED":
        return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
      case "CHANGE_REJECTED":
        return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
      case "EDIT_MADE":
        return "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
      case "STATUS_CHANGED":
        return "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "SNAPSHOT_CREATED":
      case "SNAPSHOT_RESTORED":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <h3 className="font-medium text-sm">활동 로그</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={refresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Activities List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && activities.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8 px-4">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>아직 활동이 없습니다</p>
          </div>
        ) : (
          <div className="p-2">
            {/* Timeline */}
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

              {/* Activity items */}
              <div className="space-y-1">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="relative flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "relative z-10 flex items-center justify-center h-7 w-7 rounded-full shrink-0",
                        getActivityColor(activity.activityType)
                      )}
                    >
                      {getActivityIcon(activity.activityType)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs leading-relaxed">
                        {activity.summary}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={loadMore}
                >
                  더 보기
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
