# TransNovel EventBridge Configuration
# Replaces Vercel Cron jobs

# Health Check Rule (every 5 minutes)
resource "aws_cloudwatch_event_rule" "health_check" {
  name                = "${var.project_name}-health-check"
  description         = "Triggers health checker Lambda every 5 minutes"
  schedule_expression = "rate(5 minutes)"

  tags = {
    Name = "${var.project_name}-health-check-rule"
  }
}

resource "aws_cloudwatch_event_target" "health_check" {
  rule      = aws_cloudwatch_event_rule.health_check.name
  target_id = "HealthCheckerLambda"
  arn       = aws_lambda_function.health_checker.arn
}

resource "aws_lambda_permission" "health_check" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_checker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health_check.arn
}

# Stale Job Cleanup Rule (every hour)
resource "aws_cloudwatch_event_rule" "stale_cleanup" {
  name                = "${var.project_name}-stale-cleanup"
  description         = "Triggers stale job cleanup every hour"
  schedule_expression = "rate(1 hour)"

  tags = {
    Name = "${var.project_name}-stale-cleanup-rule"
  }
}

resource "aws_cloudwatch_event_target" "stale_cleanup" {
  rule      = aws_cloudwatch_event_rule.stale_cleanup.name
  target_id = "StaleCleanupLambda"
  arn       = aws_lambda_function.health_checker.arn

  input = jsonencode({
    action = "cleanup_stale"
  })
}

resource "aws_lambda_permission" "stale_cleanup" {
  statement_id  = "AllowEventBridgeInvokeCleanup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_checker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.stale_cleanup.arn
}

# DLQ Processor Rule (every 15 minutes)
resource "aws_cloudwatch_event_rule" "dlq_processor" {
  name                = "${var.project_name}-dlq-processor"
  description         = "Processes DLQ messages every 15 minutes"
  schedule_expression = "rate(15 minutes)"

  tags = {
    Name = "${var.project_name}-dlq-processor-rule"
  }
}

resource "aws_cloudwatch_event_target" "dlq_processor" {
  rule      = aws_cloudwatch_event_rule.dlq_processor.name
  target_id = "DlqProcessorLambda"
  arn       = aws_lambda_function.health_checker.arn

  input = jsonencode({
    action = "process_dlq"
  })
}

resource "aws_lambda_permission" "dlq_processor" {
  statement_id  = "AllowEventBridgeInvokeDlq"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_checker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.dlq_processor.arn
}

# Metrics Dashboard Rule (daily summary at 9 AM KST)
resource "aws_cloudwatch_event_rule" "daily_metrics" {
  name                = "${var.project_name}-daily-metrics"
  description         = "Generates daily metrics summary"
  schedule_expression = "cron(0 0 * * ? *)" # 9 AM KST = 0:00 UTC

  tags = {
    Name = "${var.project_name}-daily-metrics-rule"
  }
}

resource "aws_cloudwatch_event_target" "daily_metrics" {
  rule      = aws_cloudwatch_event_rule.daily_metrics.name
  target_id = "DailyMetricsLambda"
  arn       = aws_lambda_function.health_checker.arn

  input = jsonencode({
    action = "daily_metrics"
  })
}

resource "aws_lambda_permission" "daily_metrics" {
  statement_id  = "AllowEventBridgeInvokeMetrics"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_checker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_metrics.arn
}
