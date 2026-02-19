# TransNovel AWS Infrastructure Variables

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Environment name (production, staging)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "transnovel"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

# RDS Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "transnovel"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "transnovel_admin"
  sensitive   = true
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

# Lambda Configuration
variable "lambda_memory_size" {
  description = "Lambda memory size in MB (used by bible worker)"
  type        = number
  default     = 1024
}

variable "translation_lambda_memory_size" {
  description = "Translation worker Lambda memory size in MB"
  type        = number
  default     = 1536
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 900 # 15 minutes
}

variable "translation_lambda_concurrency" {
  description = "Translation worker SQS event source maximum concurrency"
  type        = number
  default     = 1000
}

variable "bible_lambda_concurrency" {
  description = "Bible worker SQS event source maximum concurrency"
  type        = number
  default     = 10
}

# Legacy variable (kept for backwards compat with tfvars)
variable "lambda_reserved_concurrency" {
  description = "Deprecated: use translation_lambda_concurrency and bible_lambda_concurrency"
  type        = number
  default     = 50
}

# SQS Configuration
variable "sqs_visibility_timeout" {
  description = "SQS message visibility timeout in seconds"
  type        = number
  default     = 960 # 16 minutes (must be > Lambda timeout of 15 minutes)
}

variable "sqs_message_retention" {
  description = "SQS message retention period in seconds"
  type        = number
  default     = 345600 # 4 days
}

# Secrets (to be set in terraform.tfvars or environment)
variable "nextauth_secret" {
  description = "NextAuth secret key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "dev_allowed_ips" {
  description = "Developer IP addresses allowed to access RDS directly"
  type        = list(string)
  default     = ["115.138.39.129/32"]
}

variable "gemini_api_keys" {
  description = "List of Gemini API keys for pooling"
  type        = list(string)
  sensitive   = true
  default     = []
}
