# ✏️ Sketchy Snake 🐍

<p align="center">
  <img src="og-thumbnail.jpg" alt="Sketchy Snake Banner" width="100%" style="border-radius: 12px; border: 3px solid #2A2B32;" />
</p>

<p align="center">
  <strong>A hand-drawn arcade snake game built inside a living sketchbook spread with chill lo-fi beats, munchkins, and mobile haptics.</strong>
</p>

<p align="center">
  <a href="https://aunysillyme.github.io/sketchy-snake/"><img src="https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-1D4ED8?style=for-the-badge&logo=github" alt="Live Demo" /></a>
  <a href="https://aunysillyme.itch.io/sketchy-snake"><img src="https://img.shields.io/badge/Play%20on-itch.io-FA5C5C?style=for-the-badge&logo=itch.io" alt="itch.io" /></a>
  <a href="https://aunysillyme.github.io/sketchy-snake-vr/"><img src="https://img.shields.io/badge/VR%20Edition-WebXR-7E22CE?style=for-the-badge&logo=oculus" alt="VR Edition" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-F97316?style=for-the-badge" alt="MIT License" /></a>
</p>

---

## 🎮 Quick Links

* **🌐 Web Playable (GitHub Pages):** [https://aunysillyme.github.io/sketchy-snake/](https://aunysillyme.github.io/sketchy-snake/)
* **🕹️ itch.io Release:** [https://aunysillyme.itch.io/sketchy-snake](https://aunysillyme.itch.io/sketchy-snake)
* **🥽 3D VR Edition (WebXR):** [https://aunysillyme.github.io/sketchy-snake-vr/](https://aunysillyme.github.io/sketchy-snake-vr/)

---

## 🎨 The 'Sketchy' Art Spec

Instead of a standard clean grid, **Sketchy Snake** is built to feel like an illustrator's open notebook:

* **Procedural Graphite Strokes:** Double-pass jittered quadratic bezier curves give every snake segment and boundary wall a textured hand-drawn pencil outline.
* **Warm Sketchbook Palette:** Creamy textured paper background (`#FCFAF6`), Cobalt Blue (`#1D4ED8`), Hot Magenta (`#DB2777`), Purple Ink (`#7E22CE`), and the signature Orange Heart (`#F97316` `🧡`).
* **Living Marginalia:** Floating doodle accents (sleeping black cat, potted plant, coffee cup, musical notes, and handwritten mantras like *"progress not perfection"* and *"coffee = fuel ⚡"*).

---

## ⚔️ VS Duel Mode (Tron-style)

Tap **VS DUEL MODE ⚔️** on the start card for local two-player duels on one screen:

* **Random spawns:** both snakes drop onto random, well-separated cells facing open paper.
* **Permanent pencil trails:** nobody's tail shrinks — every stroke you draw stays on the page as a wall.
* **Win condition:** survive. Force your rival into your trail, their own trail, or the margin. Same-cell and head-on crashes are a **Double Smudge** (no point).
* **Munchkins are erasers:** eating one scores points *and* rubs out 5 of your own tail segments — the only way to open up space again.
* **Match tally:** the two score cards become the P1 ✏️ / P2 ⚔️ round tallies; **NEXT ROUND ⚔️** re-racks with fresh spawns.

| Player | Keyboard | Touch |
|---|---|---|
| **P1** ✏️ (cobalt) | `W` `A` `S` `D` | On-screen D-pad |
| **P2** ⚔️ (purple) | `Arrow Keys` | Swipe the paper |

Duels run at a fixed tempo with no speed-up, so neither player gets an advantage from scoring.

---

## 🥑 The Munchkin Food Menu

| Munchkin | Points | Special Effect |
|---|---|---|
| 🥑 **Avocado Head** | `+10` | Fresh & crispy snack |
| 🥒 **Cucumber Head** | `+15` | Crunchy patterned slice |
| 🎃 **Pumpkin Head** | `+20` | Autumn doodle bonus |
| 🥔 **Potato Head** | `+15` | Pure potato power |
| ☕ **Coffee Fuel** | `+30` | Speed combo + floating steam lines |
| 🧡 **Orange Heart** | `+50` | Signature brand score multiplier |

---

## 🎵 Interactive Lo-Fi Synthesizer

The game features an embedded, zero-dependency **Web Audio API synthesizer & sequencer** that generates chill lo-fi melodies in real time:

1. ⚡ **Blue Lightning** (124 BPM · Melodic synth arpeggios in Am / C)
2. 🌅 **Afterglow** (88 BPM · Sunset lo-fi chord progressions)
3. 🏃‍♀️ **Run Away** (120 BPM · Driving retro synth groove)

*Engineered with pre-buffered hardware audio loops for zero CPU overhead and 60 FPS gameplay on mobile devices.*

---

## 🕹️ Controls

| Platform | Control Scheme | Action |
|---|---|---|
| **Mobile / Touch** | Swipe Gestures | Slither in any direction |
| **Mobile / Touch** | On-screen D-Pad | Steer with tactile feedback |
| **Desktop / Keyboard** | `Arrow Keys` / `WASD` | Steer snake (solo: both work) |
| **Desktop / Keyboard** | `Spacebar` | Pause / Resume |
| **Android** | Hardware Haptics | Micro-vibrations on every bite (`navigator.vibrate`) |

---

## 🚀 Local Development

No heavy build tools required. To run the game locally:

```bash
# Clone the repository
git clone https://github.com/aunysillyme/sketchy-snake.git
cd sketchy-snake

# Start a local HTTP server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

---

## 📱 Native Android & Capacitor Build

To compile as a native Android APK or Google Play App Bundle (`.aab`):

```bash
# Install dependencies
npm install

# Sync web assets to native Android project
npx cap sync android

# Open in Android Studio
npx cap open android

# Or build debug APK directly via Gradle
cd android && ./gradlew assembleDebug
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for personal, educational, and commercial use.

---

<p align="center">
  <em>“progress not perfection · duality is architecture 🧡”</em><br>
  <strong>Built with 🧡 by <a href="https://github.com/aunysillyme">Auny</a> (@AunySillyMe)</strong>
</p>
