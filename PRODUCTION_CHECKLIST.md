# Production Checklist (100+ Concurrent Users)

## Infrastructure Changes (Manual Apply Required)

### 1. DB Connection Pool — CRITICAL
- Add `?connection_limit=25` to `DATABASE_URL` in environment variables
- This limits each Prisma instance to 25 connections (instead of default ~5)
- With RDS Proxy at 180 available connections, this supports ~7 concurrent Lambda instances safely

### 2. Lambda Reserved Concurrency — CRITICAL
- Reduce translation-worker Lambda concurrency from **1000 → 50**
- Reduce bible-worker Lambda concurrency from **1000 → 50**
- Reason: 1000 concurrent Lambdas × 25 connections each = 25,000 connections vs 180 available
- At 50 concurrency: 50 × 25 = 1,250 max connections, still over 180 but connection_limit caps actual usage

### 3. RDS Proxy Borrow Timeout
- Reduce from **120s → 60s**
- Prevents requests from waiting too long for a connection, fails fast instead

### 4. Lambda Environment Variables
- Ensure all Lambda workers have `DATABASE_URL` with `?connection_limit=5` (lower than web app)
- Lambda instances are short-lived, so they need fewer connections per instance
- Recommended: Lambda `connection_limit=5`, Web app `connection_limit=25`

## Code Changes (Applied)

- [x] #2 Gemini rate limiter: per-key rate limiting (4000 RPM total vs 800 RPM)
- [x] #3 Unbounded queries: glossary pagination, chapters take:1000, replies take:50
- [x] #5 Circuit breaker: threshold 5→10, timeout 60s→300s
- [x] #6 Translation polling: reduced SSE log spam
- [x] #7 Download OOM: max 200 chapters per download
- [x] #8 File upload: 10MB size limit
- [x] #9 Response caching: Cache-Control headers on work metadata
- [x] #10 Security headers: CSP, X-Frame-Options, etc.

## Future Items (Medium Priority)

### DLQ Handler (#4)
- SQS Dead Letter Queue messages are permanently lost after 3-5 retries
- Need: Lambda function to process DLQ messages (requeue or alert)
- Alternative: CloudWatch alarm on DLQ message count > 0

### Error Monitoring (#11)
- 156 `console.error` calls in codebase → lost in Vercel logs
- Integrate Sentry or similar error tracking service

### CASCADE DELETE (#13)
- `ChapterComment.authorId` uses RESTRICT — user deletion fails if they have comments
- Change to CASCADE or SET NULL in Prisma schema

### JWT Token Refresh (#15)
- Role changes not reflected until token expires (up to 30 days)
- Consider shorter token lifetime or forced re-auth on role change
