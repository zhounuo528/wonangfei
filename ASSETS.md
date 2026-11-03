# 猫咪素材记录

使用内置 imagegen 生成，真实透明背景。开心与焦虑是同一角色的两种表情；隐藏金额固定使用开心图，不按隐藏的余额变化。不含循环动画。

项目最终素材：`src/mascot-happy.png`、`src/mascot-anxious.png`。

开心图提示：

> Use case: illustration-story. Asset type: transparent desktop app mascot illustration, used at 230px wide next to salary numbers. Reference image is STYLE REFERENCE ONLY, not a UI to reproduce. Generate ONE cute little orange-and-cream kitten, round oversized head, tiny rounded body, short ears, pink cheeks, little curved forehead stripes. Happy expression: eyes gently closed in crescents, small cheerful open smile, relaxed paws propping up its cheeks behind a small dark mint gray laptop, mint green mug beside laptop. Very cute, polished hand-drawn 2D flat editorial illustration, warm charcoal outlines of consistent medium weight, cream ivory/orange fur, restrained mint accents. Match the cozy cream/orange/green desktop mock's mascot style but make this new kitten distinctly rounder and cuter. Isolated full subject, compact horizontal 4:3 composition, transparent background with genuine alpha, no background scene, no frame, no text, no coins, no UI, no watermark. Leave a small transparent margin all around; all paws, mug, laptop fully in frame. Character should be readable at 180px.

焦虑图以开心图为编辑目标，提示：

> Use case: precise-object-edit. Edit target is the provided transparent orange kitten app mascot. Create its anxious / worried expression for an app's negative earnings state. Change ONLY facial expression and the tiny emotion marks: eyes become wide small dark round eyes with white catchlights, eyebrows raised in a worried slope, mouth a tiny worried wavy curve, one small pale blue sweat drop beside forehead; replace the three happy orange rays with two subtle worried curved marks. Keep the EXACT same cute kitten identity, round head outline, ears, three orange forehead stripes, fur colors, pink cheeks, body, paws propping cheeks, laptop, mug, tail, all positions, line weight, scale, framing and transparent alpha background. Same warm charcoal outlines, cream/orange fur, mint mug. No panic, no horror, no tears, no text, no UI, no added background. This is the identical character with worried face, not a new character. Preserve dimensions and placements so swapping the two images causes no layout jump.
