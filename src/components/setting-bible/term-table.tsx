"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TermCategory } from "@prisma/client";
import { Edit2, Trash2 } from "lucide-react";

interface Term {
  id: string;
  original: string;
  translated: string;
  category: TermCategory;
  note: string | null;
  context: string | null;
  firstAppearance: number | null;
  frequency: number;
  isConfirmed: boolean;
}

interface TermTableProps {
  terms: Term[];
  onEdit?: (term: Term) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}

const CATEGORY_CONFIG: Record<TermCategory, {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
}> = {
  CHARACTER: { label: "인명", variant: "default" },
  PLACE: { label: "지명", variant: "secondary" },
  ORGANIZATION: { label: "조직", variant: "secondary" },
  RANK_TITLE: { label: "직위", variant: "outline" },
  SKILL_TECHNIQUE: { label: "무공", variant: "destructive" },
  ITEM: { label: "아이템", variant: "outline" },
  OTHER: { label: "기타", variant: "outline" },
};

export function TermTable({ terms, onEdit, onDelete, readOnly = false }: TermTableProps) {
  if (terms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        등록된 용어가 없습니다
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">분류</TableHead>
            <TableHead>원문</TableHead>
            <TableHead>번역</TableHead>
            <TableHead className="hidden md:table-cell">메모</TableHead>
            <TableHead className="w-[60px] text-center hidden sm:table-cell">등장</TableHead>
            {!readOnly && <TableHead className="w-[80px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map((term) => {
            const categoryConfig = CATEGORY_CONFIG[term.category];
            return (
              <TableRow key={term.id} className="group">
                <TableCell>
                  <Badge variant={categoryConfig.variant} className="text-xs">
                    {categoryConfig.label}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{term.original}</TableCell>
                <TableCell>{term.translated}</TableCell>
                <TableCell className="text-muted-foreground text-sm hidden md:table-cell max-w-[200px] truncate">
                  {term.note || "-"}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground hidden sm:table-cell">
                  {term.firstAppearance ? `${term.firstAppearance}화` : "-"}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEdit(term)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => onDelete(term.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
