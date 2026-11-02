SELECT * FROM posts
WHERE (created_at, id)
    < ($1, $2)
ORDER BY created_at DESC,
         id DESC
LIMIT 20;
