import sqlite3
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import bcrypt
from datetime import datetime, timezone, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="一口馬主出走予定共有アプリ")

# デプロイ環境のPostgreSQL（Neon）、またはローカルのSQLiteを使用する
DATABASE_URL = os.getenv("DATABASE_URL")
DB_FILE = "database.db"

# 管理者用マスターパスワード（環境変数から取得、なければデフォルト値）
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "animan_admin_pass")

# データベース初期化
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            horse_name TEXT NOT NULL,
            club TEXT NOT NULL,
            race_date TEXT NOT NULL,
            racecourse TEXT NOT NULL,
            race_number INTEGER NOT NULL,
            conditions TEXT NOT NULL,
            confidence INTEGER NOT NULL,
            poster_name TEXT,
            comment TEXT,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

@app.on_event("startup")
def startup():
    init_db()

# DB接続取得ユーティリティ
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row  # 辞書形式でアクセス可能にする
    try:
        yield conn
    finally:
        conn.close()

# リクエスト・レスポンス用のPydanticモデル
class PostBase(BaseModel):
    horse_name: str
    club: str
    race_date: str
    racecourse: str
    race_number: int
    conditions: str
    confidence: int
    poster_name: Optional[str] = ""
    comment: Optional[str] = ""

class PostCreate(PostBase):
    password: str

class PostUpdate(PostBase):
    password: str

class PostResponse(PostBase):
    id: int
    created_at: str

# APIエンドポイント
@app.get("/api/posts", response_model=List[PostResponse])
def get_posts(db = Depends(get_db)):
    if DATABASE_URL:
        cursor = db.cursor(cursor_factory=RealDictCursor)
    else:
        cursor = db.cursor()
    
    # 過去のレースを自動削除 (海外からのアクセス＋時差を考慮して、レース日の「翌日」になったら削除する)
    JST = timezone(timedelta(hours=+9), 'JST')
    
    # 日本時間での「昨日」の日付文字列を取得 (例: 今日が23日の場合、22日以前のものを消す)
    yesterday_str = (datetime.now(JST) - timedelta(days=1)).strftime('%Y-%m-%d')
    if DATABASE_URL:
        cursor.execute('DELETE FROM posts WHERE race_date < %s', (yesterday_str,))
    else:
        cursor.execute('DELETE FROM posts WHERE race_date < ?', (yesterday_str,))
    db.commit()

    # レース開催日が近い順、同じならレース番号順
    cursor.execute('''
        SELECT id, horse_name, club, race_date, racecourse, race_number, 
               conditions, confidence, poster_name, comment, created_at 
        FROM posts 
        ORDER BY race_date ASC, racecourse ASC, race_number ASC
    ''')
    posts = cursor.fetchall()
    
    # 日付型の変換が必要な場合のパッチ処理
    result = []
    for post in posts:
        post_dict = dict(post)
        if isinstance(post_dict.get('created_at'), datetime):
             post_dict['created_at'] = post_dict['created_at'].strftime("%Y-%m-%d %H:%M:%S")
        result.append(post_dict)
    
    return result

@app.post("/api/posts", response_model=PostResponse)
def create_post(post: PostCreate, db = Depends(get_db)):
    if DATABASE_URL:
        cursor = db.cursor(cursor_factory=RealDictCursor)
    else:
        cursor = db.cursor()
    
    # パスワードをハッシュ化して保存
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(post.password.encode('utf-8'), salt).decode('utf-8')
    
    cursor.execute('''
        INSERT INTO posts (
            horse_name, club, race_date, racecourse, race_number, 
            conditions, confidence, poster_name, comment, password
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        post.horse_name, post.club, post.race_date, post.racecourse, post.race_number,
        post.conditions, post.confidence, post.poster_name, post.comment, hashed_password
    ))
    db.commit()
    post_id = cursor.lastrowid
    
    cursor.execute('SELECT * FROM posts WHERE id = ?', (post_id,))
    new_post = dict(cursor.fetchone())
    return new_post

@app.put("/api/posts/{post_id}", response_model=PostResponse)
def update_post(post_id: int, post: PostUpdate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute('SELECT password FROM posts WHERE id = ?', (post_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # マスターパスワードまたはハッシュ化されたパスワードと入力されたパスワードを照合
    is_admin = (post.password == ADMIN_PASSWORD)
    if not is_admin and not bcrypt.checkpw(post.password.encode('utf-8'), row["password"].encode('utf-8')):
        raise HTTPException(status_code=403, detail="Incorrect password")
    
    query = '''
        UPDATE posts SET 
            horse_name = ?, club = ?, race_date = ?, racecourse = ?, race_number = ?, 
            conditions = ?, confidence = ?, poster_name = ?, comment = ?
        WHERE id = ?
    '''
    if DATABASE_URL:
        query = query.replace('?', '%s')
        
    cursor.execute(query, (
        post.horse_name, post.club, post.race_date, post.racecourse, post.race_number,
        post.conditions, post.confidence, post.poster_name, post.comment, post_id
    ))
    db.commit()
    
    if DATABASE_URL:
         cursor.execute('SELECT * FROM posts WHERE id = %s', (post_id,))
    else:
         cursor.execute('SELECT * FROM posts WHERE id = ?', (post_id,))
         
    updated_post = dict(cursor.fetchone())
    if isinstance(updated_post.get('created_at'), datetime):
        updated_post['created_at'] = updated_post['created_at'].strftime("%Y-%m-%d %H:%M:%S")
        
    return updated_post

class DeleteRequest(BaseModel):
    password: str

@app.delete("/api/posts/{post_id}")
def delete_post(post_id: int, req: DeleteRequest, db = Depends(get_db)):
    if DATABASE_URL:
        cursor = db.cursor(cursor_factory=RealDictCursor)
    else:
        cursor = db.cursor()

    if DATABASE_URL:
        cursor.execute('SELECT password FROM posts WHERE id = %s', (post_id,))
    else:
        cursor.execute('SELECT password FROM posts WHERE id = ?', (post_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # マスターパスワードまたはハッシュ化されたパスワードと入力されたパスワードを照合
    is_admin = (req.password == ADMIN_PASSWORD)
    if not is_admin and not bcrypt.checkpw(req.password.encode('utf-8'), row["password"].encode('utf-8')):
        raise HTTPException(status_code=403, detail="Incorrect password")
    
    if DATABASE_URL:
        cursor.execute('DELETE FROM posts WHERE id = %s', (post_id,))
    else:
        cursor.execute('DELETE FROM posts WHERE id = ?', (post_id,))
    db.commit()
    return {"message": "Post deleted successfully"}

# 静的ファイルの配信設定
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")
