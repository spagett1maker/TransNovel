# TransNovel Lambda Functions Configuration

# IAM Role for Lambda
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-role"
  }
}

# Lambda Execution Policy
resource "aws_iam_role_policy" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.project_name}-*:*"
      },
      # SQS
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.translation.arn,
          aws_sqs_queue.bible.arn,
          aws_sqs_queue.dlq.arn
        ]
      },
      # Secrets Manager
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.database.arn,
          aws_secretsmanager_secret.gemini.arn,
          aws_secretsmanager_secret.auth.arn
        ]
      }
    ]
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "translation_worker" {
  name              = "/aws/lambda/${var.project_name}-translation-worker"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-translation-worker-logs"
  }
}

resource "aws_cloudwatch_log_group" "bible_worker" {
  name              = "/aws/lambda/${var.project_name}-bible-worker"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-bible-worker-logs"
  }
}

resource "aws_cloudwatch_log_group" "health_checker" {
  name              = "/aws/lambda/${var.project_name}-health-checker"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-health-checker-logs"
  }
}

# Lambda Layer for shared code (Prisma, utils)
# Build this separately and upload
# resource "aws_lambda_layer_version" "shared" {
#   filename            = "../lambda/layers/shared.zip"
#   layer_name          = "${var.project_name}-shared-layer"
#   compatible_runtimes = ["nodejs22.x"]
#   description         = "Shared libraries for TransNovel Lambda functions"
# }

# Placeholder ZIP for initial deployment (will be replaced by CI/CD)
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Placeholder' });"
    filename = "index.js"
  }
}

# Translation Worker Lambda
resource "aws_lambda_function" "translation_worker" {
  function_name = "${var.project_name}-translation-worker"
  description   = "Processes translation jobs from SQS"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"

  role        = aws_iam_role.lambda_execution.arn
  memory_size = var.translation_lambda_memory_size
  timeout     = var.lambda_timeout

  environment {
    variables = {
      NODE_ENV                    = var.environment
      AWS_REGION_CUSTOM           = var.aws_region
      DATABASE_SECRET_ARN         = aws_secretsmanager_secret.database.arn
      GEMINI_SECRET_ARN           = aws_secretsmanager_secret.gemini.arn
      SQS_TRANSLATION_QUEUE_URL   = aws_sqs_queue.translation.url
      SQS_BIBLE_QUEUE_URL         = aws_sqs_queue.bible.url
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.translation_worker,
    aws_iam_role_policy.lambda_execution
  ]

  tags = {
    Name = "${var.project_name}-translation-worker"
  }
}

# Bible Worker Lambda
resource "aws_lambda_function" "bible_worker" {
  function_name = "${var.project_name}-bible-worker"
  description   = "Processes bible generation jobs from SQS"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"

  role        = aws_iam_role.lambda_execution.arn
  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  environment {
    variables = {
      NODE_ENV                    = var.environment
      AWS_REGION_CUSTOM           = var.aws_region
      DATABASE_SECRET_ARN         = aws_secretsmanager_secret.database.arn
      GEMINI_SECRET_ARN           = aws_secretsmanager_secret.gemini.arn
      SQS_TRANSLATION_QUEUE_URL   = aws_sqs_queue.translation.url
      SQS_BIBLE_QUEUE_URL         = aws_sqs_queue.bible.url
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.bible_worker,
    aws_iam_role_policy.lambda_execution
  ]

  tags = {
    Name = "${var.project_name}-bible-worker"
  }
}

# Health Checker Lambda (for EventBridge)
resource "aws_lambda_function" "health_checker" {
  function_name = "${var.project_name}-health-checker"
  description   = "Checks job health and cleans up stale jobs"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"

  role        = aws_iam_role.lambda_execution.arn
  memory_size = 512
  timeout     = 300 # 5 minutes

  environment {
    variables = {
      NODE_ENV                    = var.environment
      AWS_REGION_CUSTOM           = var.aws_region
      DATABASE_SECRET_ARN         = aws_secretsmanager_secret.database.arn
      SQS_TRANSLATION_QUEUE_URL   = aws_sqs_queue.translation.url
      SQS_BIBLE_QUEUE_URL         = aws_sqs_queue.bible.url
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.health_checker,
    aws_iam_role_policy.lambda_execution
  ]

  tags = {
    Name = "${var.project_name}-health-checker"
  }
}

# SQS Event Source Mapping for Translation Worker
resource "aws_lambda_event_source_mapping" "translation_sqs" {
  event_source_arn = aws_sqs_queue.translation.arn
  function_name    = aws_lambda_function.translation_worker.arn
  batch_size       = 1 # Process one message at a time
  enabled          = true

  scaling_config {
    maximum_concurrency = var.translation_lambda_concurrency
  }
}

# SQS Event Source Mapping for Bible Worker
resource "aws_lambda_event_source_mapping" "bible_sqs" {
  event_source_arn                   = aws_sqs_queue.bible.arn
  function_name                      = aws_lambda_function.bible_worker.arn
  batch_size                         = 5
  enabled                            = true
  function_response_types            = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.bible_lambda_concurrency
  }
}

# CloudWatch Alarms for Lambda

resource "aws_cloudwatch_metric_alarm" "translation_errors" {
  alarm_name          = "${var.project_name}-translation-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Translation Lambda error rate is high"

  dimensions = {
    FunctionName = aws_lambda_function.translation_worker.function_name
  }

  tags = {
    Name = "${var.project_name}-translation-errors-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "bible_errors" {
  alarm_name          = "${var.project_name}-bible-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Bible Lambda error rate is high"

  dimensions = {
    FunctionName = aws_lambda_function.bible_worker.function_name
  }

  tags = {
    Name = "${var.project_name}-bible-errors-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "translation_duration" {
  alarm_name          = "${var.project_name}-translation-lambda-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 600000 # 10 minutes (in ms)
  alarm_description   = "Translation Lambda is running slow"

  dimensions = {
    FunctionName = aws_lambda_function.translation_worker.function_name
  }

  tags = {
    Name = "${var.project_name}-translation-duration-alarm"
  }
}
