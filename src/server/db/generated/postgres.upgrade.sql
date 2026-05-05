ALTER TABLE "account_tokens" ADD COLUMN "used_quota" DOUBLE PRECISION;
ALTER TABLE "account_tokens" ADD COLUMN "remain_quota" DOUBLE PRECISION;
ALTER TABLE "account_tokens" ADD COLUMN "unlimited_quota" BOOLEAN;
ALTER TABLE "account_tokens" ADD COLUMN "manual_group_ratio" DOUBLE PRECISION;
