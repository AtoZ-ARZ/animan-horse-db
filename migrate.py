import os
import sqlite3
import psycopg2

DATABASE_URL = "postgresql://neondb_owner:npg_mtGUKZk5DsH1@ep-wispy-hill-aifaxwmb-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
DB_FILE = "database.db"

def migrate_db():
    try:
        # Migrate production Neon PostgreSQL DB
        print("Migrating Neon PostgreSQL DB...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS race_name VARCHAR(255) DEFAULT '';")
        conn.commit()
        conn.close()
        print("PostgreSQL Migration Complete.")
    except Exception as e:
        print(f"PostgreSQL Migration Error: {e}")

    try:
        # Migrate local SQLite DB
        if os.path.exists(DB_FILE):
            print("Migrating Local SQLite DB...")
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            # SQLite doesn't have IF NOT EXISTS for ADD COLUMN easily, so we handle the exception
            try:
                cursor.execute("ALTER TABLE posts ADD COLUMN race_name TEXT DEFAULT '';")
                conn.commit()
                print("SQLite Migration Complete.")
            except sqlite3.OperationalError as e:
                print(f"SQLite Column likely exists. Error: {e}")
            conn.close()
    except Exception as e:
        print(f"SQLite Migration Error: {e}")

if __name__ == "__main__":
    migrate_db()
