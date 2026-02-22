// Fix: moduleResolution "bundler" can't follow the re-export chain
// @prisma/client/default.d.ts -> .prisma/client/default -> ./index
// This augmentation re-exports the enums that TypeScript fails to resolve.
import type {} from "@prisma/client";

declare module "@prisma/client" {
  export {
    UserRole,
    AgeRating,
    WorkStatus,
    OriginalStatus,
    SourceLanguage,
    ChapterStatus,
    LogLevel,
    LogCategory,
    BibleStatus,
    CharacterRole,
    TermCategory,
    EventType,
    BibleJobStatus,
    SnapshotType,
    ChangeType,
    ChangeStatus,
    ActivityType,
    EditorAvailability,
    ProjectListingStatus,
    ApplicationStatus,
    RevisionRequestStatus,
  } from ".prisma/client/index";
}
