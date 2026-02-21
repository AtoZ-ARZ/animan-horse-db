document.addEventListener('DOMContentLoaded', () => {
    // === Variables & Elements ===
    const timeline = document.getElementById('timeline');

    // Modals
    const postModal = document.getElementById('post-modal');
    const editModal = document.getElementById('edit-modal');

    // Forms
    const postForm = document.getElementById('post-form');
    const editForm = document.getElementById('edit-form');
    const authSection = document.getElementById('auth-section');

    // Buttons
    const openPostModalBtn = document.getElementById('open-post-modal-btn');
    const closeBtns = document.querySelectorAll('.close-btn');

    // Auth logic in Edit Modal
    const unlockEditBtn = document.getElementById('unlock-edit-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const authPasswordInput = document.getElementById('auth-password');
    const authError = document.getElementById('auth-error');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // State
    const API_BASE = '/api/posts';
    let currentPosts = [];
    let activePostId = null;

    // === Initialization ===
    fetchPosts();

    // === Event Listeners ===

    // Open Post Modal
    openPostModalBtn.addEventListener('click', () => {
        postForm.reset();
        openModal(postModal);
    });

    // Close Modals
    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal');
            closeModal(document.getElementById(modalId));
        });
    });

    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        closeModal(editModal);
    });

    // Create Post
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-post-btn');
        submitBtn.disabled = true;

        const formData = new FormData(postForm);
        const data = Object.fromEntries(formData.entries());
        data.race_number = parseInt(data.race_number);
        data.confidence = parseInt(data.confidence);

        // UIのsurfaceとdistanceを結合してDB用のconditionsにする
        data.conditions = data.surface + data.distance;
        delete data.surface;
        delete data.distance;

        try {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                closeModal(postModal);
                postForm.reset();
                fetchPosts();
            } else {
                alert('投稿に失敗しました。');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            alert('通信エラーが発生しました。');
        } finally {
            submitBtn.disabled = false;
        }
    });

    // Auth Action: Unlock Edit
    unlockEditBtn.addEventListener('click', () => {
        setupEditForm();
    });

    // Auth Action: Delete
    confirmDeleteBtn.addEventListener('click', async () => {
        const password = authPasswordInput.value;
        if (!password) {
            showAuthError('パスワードを入力してください。');
            return;
        }

        if (!confirm('本当にこの投稿を削除しますか？')) return;

        confirmDeleteBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/${activePostId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                closeModal(editModal);
                fetchPosts();
            } else if (res.status === 403) {
                showAuthError('パスワードが間違っています。');
            } else {
                showAuthError('削除に失敗しました。');
            }
        } catch (error) {
            showAuthError('通信エラーが発生しました。');
        } finally {
            confirmDeleteBtn.disabled = false;
        }
    });

    // Update Post
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-update-btn');
        submitBtn.disabled = true;

        const formData = new FormData(editForm);
        const data = Object.fromEntries(formData.entries());
        data.race_number = parseInt(data.race_number);
        data.confidence = parseInt(data.confidence);
        data.password = authPasswordInput.value; // Retrieved from the auth step

        // UIのsurfaceとdistanceを結合してDB用のconditionsにする
        data.conditions = data.surface + data.distance;
        delete data.surface;
        delete data.distance;

        try {
            const res = await fetch(`${API_BASE}/${activePostId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                closeModal(editModal);
                fetchPosts();
            } else if (res.status === 403) {
                alert('パスワードエラー: セッションが切れました。');
                closeModal(editModal);
            } else {
                alert('更新に失敗しました。');
            }
        } catch (error) {
            console.error('Error updating post:', error);
            alert('通信エラーが発生しました。');
        } finally {
            submitBtn.disabled = false;
        }
    });

    // === Functions ===

    async function fetchPosts() {
        try {
            const res = await fetch(API_BASE);
            const posts = await res.json();
            currentPosts = posts;
            renderPosts(posts);
        } catch (error) {
            console.error('Error fetching posts:', error);
            timeline.innerHTML = '<div class="error-message p-3">データの読み込みに失敗しました。</div>';
        }
    }

    function renderPosts(posts) {
        timeline.innerHTML = '';

        if (posts.length === 0) {
            timeline.innerHTML = `
                <div class="empty-state">
                    <h3>まだ投稿がありません</h3>
                    <p>最初の出走予定を投稿して、みんなに知らせましょう！</p>
                </div>
            `;
            return;
        }

        posts.forEach(post => {
            const dateStr = formatDate(post.race_date);
            const confidenceStars = '★'.repeat(post.confidence) + '☆'.repeat(5 - post.confidence);

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header">
                    <div class="race-info">
                        ${post.racecourse} ${post.race_number}R
                        ${post.race_name ? `<span class="race-name" style="margin-left: 8px; font-weight: normal; font-size: 0.9em; color: var(--text-secondary);">${escapeHTML(post.race_name)}</span>` : ''}
                    </div>
                    <div class="header-right">
                        <div class="race-date">${dateStr}</div>
                        <button class="action-btn edit-action-btn" data-id="${post.id}">編集/削除</button>
                    </div>
                </div>
                <div class="horse-name">${escapeHTML(post.horse_name)}</div>
                <div class="card-details">
                    <span class="tag club tag-${escapeHTML(getClubClassName(post.club))}">${escapeHTML(getClubDisplayName(post.club))}</span>
                    <span class="tag conditions">${escapeHTML(post.conditions)}</span>
                    <span class="stars" title="自信度: ${post.confidence}">${confidenceStars}</span>
                </div>
                ${post.comment ? `<div class="comment-box">${escapeHTML(post.comment)}</div>` : ''}
                <div class="poster">
                    投稿者: <strong>${escapeHTML(post.poster_name || '名無しさん')}</strong>
                </div>
            `;
            timeline.appendChild(card);
        });

        // Add event listeners to newly created edit buttons
        document.querySelectorAll('.edit-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.getAttribute('data-id'));
                openEditAuthModal(id);
            });
        });
    }

    function openEditAuthModal(id) {
        activePostId = id;
        authPasswordInput.value = '';
        authError.classList.add('hidden');
        authSection.classList.remove('hidden');
        editForm.classList.add('hidden');

        const post = currentPosts.find(p => p.id === id);
        if (post) {
            document.getElementById('edit-title').textContent = `${post.horse_name} の投稿を管理`;
        }

        openModal(editModal);
    }

    function setupEditForm() {
        const password = authPasswordInput.value;
        if (!password) {
            showAuthError('パスワードを入力してください。');
            return;
        }

        const post = currentPosts.find(p => p.id === activePostId);
        if (!post) return;

        // Since we don't have an auth endpoint, we'll tentatively unlock the form.
        // It will be fully validated on the backend upon PUT/DELETE Request.
        // However, to provide immediate feedback, one might do a dummy verification,
        // but for simplicity, we open the form and rely on backend validation on save.

        document.getElementById('edit_horse_name').value = post.horse_name;
        document.getElementById('edit_club').value = post.club;
        document.getElementById('edit_race_date').value = post.race_date;
        document.getElementById('edit_racecourse').value = post.racecourse;
        document.getElementById('edit_race_number').value = post.race_number;
        document.getElementById('edit_race_name').value = post.race_name || '';

        // DBのconditionsをsurfaceとdistanceに分割してUIにセット
        let surface = '芝';
        let distance = post.conditions || '';
        if (distance.startsWith('芝')) { surface = '芝'; distance = distance.substring(1); }
        else if (distance.startsWith('ダート')) { surface = 'ダート'; distance = distance.substring(3); }
        else if (distance.startsWith('障害')) { surface = '障害'; distance = distance.substring(2); }

        document.getElementById('edit_surface').value = surface;
        document.getElementById('edit_distance').value = distance;

        document.getElementById('edit_confidence').value = post.confidence;
        document.getElementById('edit_comment').value = post.comment || '';
        document.getElementById('edit_poster_name').value = post.poster_name || '';

        authSection.classList.add('hidden');
        editForm.classList.remove('hidden');
        authError.classList.add('hidden');
    }

    function openModal(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function showAuthError(message) {
        authError.textContent = message;
        authError.classList.remove('hidden');
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    const clubOptions = {
        "サンデーR": "サンデーレーシング",
        "社台RH": "社台レースホース",
        "G1レーシング": "G1レーシング",
        "キャロット": "キャロットクラブ",
        "シルク": "シルクホースクラブ",
        "DMMバヌーシー": "DMMバヌーシー",
        "東サラ": "東京サラブレッドクラブ",
        "ノルマンディー": "ノルマンディーOC",
        "ウイン": "ウインレーシングクラブ",
        "ラフィアン": "ラフィアンターフマンクラブ",
        "ロード": "ロードホースクラブ",
        "広尾": "広尾サラブレッド倶楽部",
        "YGG": "YGGオーナーズクラブ",
        "ライオン": "サラブレッドクラブライオン",
        "グリーン": "グリーンファーム愛馬会",
        "友駿": "友駿ホースクラブ",
        "ユニオン": "ユニオンオーナーズクラブ",
        "ターファイト": "ターファイトクラブ",
        "ローレル": "ローレルクラブ",
        "大樹": "大樹レーシングクラブ",
        "ワラウカド": "ワラウカド",
        "インゼル": "インゼルサラブレッドクラブ",
        "京サラ": "京都サラブレッドクラブ",
        "バゴバゴ": "その他・個人等"
    };

    const clubClasses = {
        "サンデーR": "sunday",
        "社台RH": "shadai",
        "G1レーシング": "g1",
        "キャロット": "carrot",
        "シルク": "silk",
        "DMMバヌーシー": "dmm",
        "東サラ": "tokyo-tc",
        "ノルマンディー": "normandy",
        "ウイン": "win",
        "ラフィアン": "ruffian",
        "ロード": "lord",
        "広尾": "hiroo",
        "YGG": "ygg",
        "ライオン": "lion",
        "グリーン": "green",
        "友駿": "yushun",
        "ユニオン": "union",
        "ターファイト": "turfite",
        "ローレル": "laurel",
        "大樹": "taiki",
        "ワラウカド": "waraukado",
        "インゼル": "insel",
        "京サラ": "kyoto-tc",
        "バゴバゴ": "other"
    };

    function getClubDisplayName(val) {
        return clubOptions[val] || val;
    }

    function getClubClassName(val) {
        return clubClasses[val] || "default";
    }

    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' };
        try {
            return new Date(dateString).toLocaleDateString('ja-JP', options);
        } catch {
            return dateString;
        }
    }
});
