---
canDie: false
hasScore: true
---

# +1 Dojo Punch: Boxity integration

The player cannot die: there is no death or game-over screen. Click (or tap) anywhere to
throw a punch and gain Power - faster at the training bags in
the Sunset Dojo for Power, step onto the punch spot in the PUNCH ZONE, charge the power
meter and release it at the top for a PERFECT punch (up to x1.5 distance, x1.6 Wins), and
smash fist-first down a runway of walls - paper, bamboo, brick, ice ... star metal: more
Power smashes further. You always get another punch. Every punch has a tiny chance of a
HIDDEN TECHNIQUE (ten of them, 1 in 25 up to 1 in 100,000: a cut-in and up to x250 Power).
Gloves (24 kinds, bought with Wins) go on your Bloxity avatar's hands and set how much
Power each gain is worth. Every rebirth is a BELT EXAM: white, yellow, orange, green,
blue, purple, red, brown, black, then bronze, silver, gold ... rainbow belts, worn on your
avatar's waist. The training bags stand in an open-air dojo (tatami floor, shoji wall,
kanji scrolls and banners, stone lanterns, a gong, striking posts). After 8 belts and 1M
Wins a portal opens World 2, the Bamboo Temple: green mountains with bamboo, pagodas and
torii, and a runway that climbs past waterfalls and snowy peaks to the spirit gates.

Built on the +1 Arm Length / +1 Tire Rolling template: inside the code the old names stay
(`health` is Power, a `tire` is a pair of gloves, a `pad` is a training bag, a `roll` is a
punch through the walls), so saves and the server protocol are unchanged.

## Leaderboards

Scores are reported by the **game server**, never by the client
(`server/src/bloxityLeaderboards.js`, `BLOXITY_LEADERBOARDS`). Every ~20 s and when a
player leaves, each pod sends the changed scores of its verified players to
`POST {api}/v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report` as `legion_<userId>`.

| Board      | Label            | Score                                | Format  |
|------------|------------------|--------------------------------------|---------|
| `rebirths` | Rebirths         | `profile.rebirths`                   | number  |
| `wins`     | Total Wins       | `profile.stats.totalWins`            | compact |
| `distance` | Longest Punch (m) | `floor(profile.stats.bestDistance)`  | compact |
| `playtime` | Minutes Played   | `floor(profile.stats.playtime / 60)` | number  |

All four are `order: desc`, `mode: best`, `reset: none`.

## Gems purchases

Boxity's purchase webhook goes to `POST /api/gems/webhook` on the game server. It is
recorded in the database by `transactionId` (idempotent) and applied exactly once by
the pod the buyer plays on. Unknown skus are answered 400 so Boxity refunds them.

## Rewarded ads

The client sends `adReward { placement, rewardToken }`; the server verifies the token
with `POST {api}/v1/ads/reward/verify` before granting anything.

## Open Rooms

Each pod reports its rooms every 2 s to `POST {MATCHMAKER_REPORT_URL}/{BLOXITY_GAME_ID}/rooms`
(`server/src/legionRoomReporter.js`, installed after `listen()`), so they show under
"Open Rooms" on the game page. The client joins `?roomId=` at launch and falls back to
normal matchmaking if that room is gone or full.

## Avatars

Preferred: Boxity's character kit (`client/src/bloxity/characterKit.js`). When
`character.canDress(key)` is true, each player's cloned `player.glb` rig is dressed with
`character.dress({ THREE, GLTFLoader, root, outfitKey, proportions: 'game' })` - the local
key from `avatar.getOutfitKey()`, everyone else's from `avatar.getOutfitKeyFor()` on their
replicated ids and proportions (the server's `look` field) - and `handle.update(key)` on
a new look. While dressed, the game does not touch the rig's parts, skin or accessories.

Otherwise (kit off, older SDK, custom character, or a failed outfit) `PlayerAvatar.jsx` +
`avatarRig.js` draw every slot by hand: skin from `avatar.getSkinTextureUrlFor()` (face,
shirt and pants drawn on), body parts, hat and back, then every slot
`avatar.getAccessorySlots()` lists with URLs from `getAccessoryUrls()` (hair, mask, neck,
chest, waist, hand, shoes and any added later): rest-inverse placement, mirrored pairs on
`mirrorBone`, `inheritScale: false` slots following the bone's position and rotation
only. A player wearing an uploaded character (`characterId`) gets its GLB via
`avatar.getCharacter()` / `getCharacterFor()`, with accessories fitted by
`characterAccessoryMatrix`; on any failure the regular avatar shows. Body proportions are
applied by moving bones, so accessories follow them.

Game gear on top of the Boxity look: boxing gloves on both forearms (`armStyles.js`,
placed per frame by `avatarRig.placeRubberArms`) and the karate belt on `Spine1`
(`belt.js`, fitted to the torso).

## Screen ads

Declared once after init (`integration.js` `SCREENS`): `panel` (the modal panels: shop,
pets, quests, belts...) and `gameplay`. There is no title menu, lobby or results screen.
Gameplay banners are OFF (the developer chose none while playing); gameplay is declared so
Boxity's admins can manage it. `ads.screen('panel' | 'gameplay')` is reported as panels
open and close.

## Server environment

| Variable                | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `BLOXITY_REPORT_TOKEN`  | Token for leaderboard and room reports (none set = no reports) |
| `MATCHMAKER_REPORT_URL` | Where the Open Rooms reporter posts (injected by Boxity hosting) |
| `BLOXITY_GAME_ID`       | Hosted game id for reports (default `1-inch-punch`)              |
| `LEGION_WEBHOOK_SECRET` | Must match the webhook's `x-legion-webhook-secret` header     |
| `MONGODB_URI`           | Shared database for profiles and Gems grants (SQLite without) |
| `BLOXITY_API_URL` etc.  | Platform URLs; production defaults (`server/src/bloxityEnv.js`) |
