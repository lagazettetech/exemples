-- Le Code #005 — la commande atomique : le contrôle et la décrémentation dans la même instruction.
-- Paramètre $1 : l'identifiant du produit.
-- >>> extrait vidéo
UPDATE produits
SET stock = stock - 1
WHERE id = $1
  AND stock > 0;
-- 1 ligne : commande OK
-- 0 ligne : rupture de stock
-- <<< extrait vidéo
