# TransNovel AWS Infrastructure Outputs

# VPC Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "Public subnet ID"
  value       = aws_subnet.public.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS endpoint (direct)"
  value       = aws_db_instance.main.endpoint
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (for Lambda)"
  value       = aws_db_proxy.main.endpoint
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "database_url" {
  description = "Database connection URL (for Vercel, direct)"
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}?connection_limit=5"
  sensitive   = true
}

output "database_url_proxy" {
  description = "Database connection URL via RDS Proxy (for Lambda)"
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_proxy.main.endpoint}:5432/${var.db_name}?connection_limit=1"
  sensitive   = true
}

# SQS Outputs
output "translation_queue_url" {
  description = "Translation SQS queue URL"
  value       = aws_sqs_queue.translation.url
}

output "translation_queue_arn" {
  description = "Translation SQS queue ARN"
  value       = aws_sqs_queue.translation.arn
}

output "bible_queue_url" {
  description = "Bible generation SQS queue URL"
  value       = aws_sqs_queue.bible.url
}

output "bible_queue_arn" {
  description = "Bible generation SQS queue ARN"
  value       = aws_sqs_queue.bible.arn
}

output "dlq_url" {
  description = "Dead letter queue URL"
  value       = aws_sqs_queue.dlq.url
}

# Lambda Outputs
output "translation_lambda_arn" {
  description = "Translation worker Lambda ARN"
  value       = aws_lambda_function.translation_worker.arn
}

output "bible_lambda_arn" {
  description = "Bible worker Lambda ARN"
  value       = aws_lambda_function.bible_worker.arn
}

output "health_checker_lambda_arn" {
  description = "Health checker Lambda ARN"
  value       = aws_lambda_function.health_checker.arn
}

# Secrets Manager Outputs
output "database_secret_arn" {
  description = "Database credentials secret ARN"
  value       = aws_secretsmanager_secret.database.arn
}

output "gemini_secret_arn" {
  description = "Gemini API keys secret ARN"
  value       = aws_secretsmanager_secret.gemini.arn
}

# Summary for easy copy-paste to Vercel
output "vercel_env_vars" {
  description = "Environment variables for Vercel (copy these)"
  value = <<-EOT

    === Copy these to Vercel Environment Variables ===

    DATABASE_URL=${nonsensitive("postgresql://${var.db_username}:****@${aws_db_instance.main.endpoint}/${var.db_name}?connection_limit=5")}
    DIRECT_URL=${nonsensitive("postgresql://${var.db_username}:****@${aws_db_instance.main.endpoint}/${var.db_name}")}

    AWS_REGION=${var.aws_region}
    SQS_TRANSLATION_QUEUE_URL=${aws_sqs_queue.translation.url}
    SQS_BIBLE_QUEUE_URL=${aws_sqs_queue.bible.url}

    (Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for Vercel to access SQS)

  EOT
}
