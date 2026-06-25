# Snake Survival Arena

This version updates the landing page UI to closely match the earlier premium mockup:

- Dark jungle/game UI
- Top navigation
- Big hero title
- Realistic snake-style hero illustration using CSS
- Play Now and GitHub buttons
- Four feature cards
- Live gameplay preview section
- Browser CTA section
- Actual playable snake game below
- Realistic canvas snakes with curved bodies, eyes, tongue, and scale highlights

## Gameplay rule fixes in this version

- Fixed the visual bug when a snake wraps around the canvas.
- Snake body drawing is split at wrap boundaries, so no long distorted line appears across the arena.
- Added shake effect when the player hits the wrong snake.
- Eating works from the mouth/head side only.
- Player can eat a small snake only by hitting its head with the player's head.
- Hitting any snake body is not counted as eating.
- Big and poison snakes can end the game if their head bumps/eats the player.
- Small snakes avoid bumping into the player by changing direction.

## Small snake rule update

- Small snakes still avoid bumping into the player.
- The player can now eat a smaller snake from any part of the small snake.
- The player must still be larger than the small snake.
- Big and poison snakes remain dangerous from any body part.

## Update
- Removed leaderboard from the landing page preview.
