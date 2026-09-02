import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(
  "https://uuhhyzxagzswcjfhngom.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aGh5enhhZ3pzd2NqZmhuZ29tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjYwOTk5MCwiZXhwIjoyMTAyMTg1OTkwfQ.snC1roOtZl1ivzVkF7gmuMYKvrfmvN8aL8dmOAR3IQ4"
);

const users = JSON.parse(
  fs.readFileSync("users.json", "utf8")
);

async function run() {
  for (const user of users) {
    const { error } =
      await supabase.auth.admin.createUser({
        email: user.email,
        password_hash: user.encrypted_password,
        email_confirm: true,
        id: user.id,
        user_metadata: user.raw_user_meta_data
      });

    if (error) {
      console.log("❌", user.email, error.message);
    } else {
      console.log("✅", user.email);
    }
  }
}

run();
