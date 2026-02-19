# TransNovel SQS Queue Configuration

# Dead Letter Queue (DLQ)
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${var.project_name}-dlq"
  }
}

# Translation Queue
resource "aws_sqs_queue" "translation" {
  name                       = "${var.project_name}-translation-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  message_retention_seconds  = var.sqs_message_retention
  receive_wait_time_seconds  = 20 # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-translation-queue"
  }
}

# Bible Generation Queue
resource "aws_sqs_queue" "bible" {
  name                       = "${var.project_name}-bible-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  message_retention_seconds  = var.sqs_message_retention
  receive_wait_time_seconds  = 20 # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5 # More retries for bible generation
  })

  tags = {
    Name = "${var.project_name}-bible-queue"
  }
}

# CloudWatch Alarms for SQS

# DLQ Messages Alarm
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${var.project_name}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 100
  alarm_description   = "DLQ has unprocessed messages - check for failures"

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }

  tags = {
    Name = "${var.project_name}-dlq-alarm"
  }
}

# Translation Queue Depth Alarm
resource "aws_cloudwatch_metric_alarm" "translation_queue_depth" {
  alarm_name          = "${var.project_name}-translation-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 100000
  alarm_description   = "Translation queue is backing up"

  dimensions = {
    QueueName = aws_sqs_queue.translation.name
  }

  tags = {
    Name = "${var.project_name}-translation-queue-alarm"
  }
}

# Bible Queue Depth Alarm
resource "aws_cloudwatch_metric_alarm" "bible_queue_depth" {
  alarm_name          = "${var.project_name}-bible-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 50000
  alarm_description   = "Bible generation queue is backing up"

  dimensions = {
    QueueName = aws_sqs_queue.bible.name
  }

  tags = {
    Name = "${var.project_name}-bible-queue-alarm"
  }
}

# SQS Queue Policies

# Translation Queue Policy
resource "aws_sqs_queue_policy" "translation" {
  queue_url = aws_sqs_queue.translation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.translation.arn
      }
    ]
  })
}

# Bible Queue Policy
resource "aws_sqs_queue_policy" "bible" {
  queue_url = aws_sqs_queue.bible.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.bible.arn
      }
    ]
  })
}
