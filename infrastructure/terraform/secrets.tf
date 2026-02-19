# TransNovel Secrets Manager Configuration

# Database Credentials Secret
resource "aws_secretsmanager_secret" "database" {
  name        = "${var.project_name}/database"
  description = "Database connection credentials for TransNovel"

  tags = {
    Name = "${var.project_name}-database-secret"
  }
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    # Lambda connects directly to RDS (publicly accessible, no VPC required)
    DATABASE_URL = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}?connection_limit=1"
    DIRECT_URL   = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}"
    DB_HOST      = aws_db_instance.main.address
    DB_PORT      = "5432"
    DB_NAME      = var.db_name
    DB_USER      = var.db_username
    DB_PASSWORD  = var.db_password
    # RDS Proxy requires these exact keys for authentication
    username     = var.db_username
    password     = var.db_password
  })
}

# Gemini API Keys Secret
resource "aws_secretsmanager_secret" "gemini" {
  name        = "${var.project_name}/gemini"
  description = "Gemini API keys for AI translation"

  tags = {
    Name = "${var.project_name}-gemini-secret"
  }
}

resource "aws_secretsmanager_secret_version" "gemini" {
  secret_id = aws_secretsmanager_secret.gemini.id
  secret_string = jsonencode({
    GEMINI_API_KEY_1 = length(var.gemini_api_keys) > 0 ? var.gemini_api_keys[0] : ""
    GEMINI_API_KEY_2 = length(var.gemini_api_keys) > 1 ? var.gemini_api_keys[1] : ""
    GEMINI_API_KEY_3 = length(var.gemini_api_keys) > 2 ? var.gemini_api_keys[2] : ""
    GEMINI_API_KEY_4 = length(var.gemini_api_keys) > 3 ? var.gemini_api_keys[3] : ""
    GEMINI_API_KEY_5 = length(var.gemini_api_keys) > 4 ? var.gemini_api_keys[4] : ""
    KEY_COUNT        = tostring(length(var.gemini_api_keys))
  })
}

# Auth Secret (NextAuth)
resource "aws_secretsmanager_secret" "auth" {
  name        = "${var.project_name}/auth"
  description = "Authentication secrets for TransNovel"

  tags = {
    Name = "${var.project_name}-auth-secret"
  }
}

resource "aws_secretsmanager_secret_version" "auth" {
  secret_id = aws_secretsmanager_secret.auth.id
  secret_string = jsonencode({
    NEXTAUTH_SECRET = var.nextauth_secret
  })
}

# Rotation (optional - can be enabled later)
# resource "aws_secretsmanager_secret_rotation" "database" {
#   secret_id           = aws_secretsmanager_secret.database.id
#   rotation_lambda_arn = aws_lambda_function.secret_rotation.arn
#   rotation_rules {
#     automatically_after_days = 90
#   }
# }
