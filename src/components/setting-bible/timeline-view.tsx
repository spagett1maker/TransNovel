"use client";

import { Badge } from "@/components/ui/badge";
import { EventType } from "@prisma/client";
import {
  BookOpen,
  Lightbulb,
  Users,
  Zap,
  Globe,
  AlertCircle,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  chapterStart: number;
  chapterEnd: number | null;
  eventType: EventType;
  importance: number;
  isForeshadowing: boolean;
  foreshadowNote: string | null;
  involvedCharacterIds: string[];
}

interface TimelineViewProps {
  events: TimelineEvent[];
}

const EVENT_TYPE_CONFIG: Record<EventType, {
  label: string;
  icon: React.ReactNode;
  color: string;
}> = {
  PLOT: {
    label: "플롯",
    icon: <BookOpen className="h-4 w-4" />,
    color: "bg-blue-100 text-blue-700 border-blue-200",
  },
  CHARACTER_DEV: {
    label: "캐릭터",
    icon: <Users className="h-4 w-4" />,
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  FORESHADOWING: {
    label: "복선",
    icon: <Lightbulb className="h-4 w-4" />,
    color: "bg-amber-100 text-amber-700 border-amber-200",
  },
  REVEAL: {
    label: "반전",
    icon: <Zap className="h-4 w-4" />,
    color: "bg-red-100 text-red-700 border-red-200",
  },
  WORLD_BUILDING: {
    label: "세계관",
    icon: <Globe className="h-4 w-4" />,
    color: "bg-green-100 text-green-700 border-green-200",
  },
};

export function TimelineView({ events }: TimelineViewProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        등록된 이벤트가 없습니다
      </div>
    );
  }

  // 중요도 순으로 정렬 (높은 것 먼저)
  const sortedEvents = [...events].sort((a, b) => {
    if (a.chapterStart !== b.chapterStart) {
      return a.chapterStart - b.chapterStart;
    }
    return b.importance - a.importance;
  });

  return (
    <div className="relative">
      {/* 타임라인 선 */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-4">
        {sortedEvents.map((event) => {
          const typeConfig = EVENT_TYPE_CONFIG[event.eventType];
          return (
            <div key={event.id} className="relative pl-10">
              {/* 타임라인 점 */}
              <div
                className={`absolute left-2 top-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${typeConfig.color}`}
              >
                {typeConfig.icon}
              </div>

              {/* 이벤트 카드 */}
              <div className="bg-card border rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={typeConfig.color}>
                      {typeConfig.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {event.chapterStart}화
                      {event.chapterEnd && event.chapterEnd !== event.chapterStart && (
                        <> - {event.chapterEnd}화</>
                      )}
                    </span>
                    {event.isForeshadowing && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <AlertCircle className="h-3 w-3" />
                        복선
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < event.importance
                            ? "bg-primary"
                            : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <h4 className="font-semibold mb-1">{event.title}</h4>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {event.description}
                </p>

                {event.foreshadowNote && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    <span className="font-medium">복선 메모:</span>{" "}
                    {event.foreshadowNote}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
