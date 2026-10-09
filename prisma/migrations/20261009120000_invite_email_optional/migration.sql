-- An invitation no longer needs an address. The printer owner can invite
-- somebody by name alone and hand the link over themselves; the account that
-- opens carries a placeholder address (src/lib/contact-email.ts). Every row
-- filed before keeps its address.
ALTER TABLE "invite" ALTER COLUMN "email" DROP NOT NULL;
