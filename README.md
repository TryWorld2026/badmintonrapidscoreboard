<div align="center">

<!-- Language Switcher -->
<p align="center">
  <a href="README.md">
    <img src="https://img.shields.io/badge/Language-English-blue?style=for-the-badge&logo=google-translate&logoColor=white" alt="English">
  </a>
  <a href="README_CN.md">
    <img src="https://img.shields.io/badge/Language-中文-red?style=for-the-badge&logo=google-translate&logoColor=white" alt="中文">
  </a>
</p>

<!-- Typing Title -->
<img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=600&size=45&duration=3000&pause=1000&color=6839E8&center=true&vCenter=true&width=800&lines=🏸+Badminton+Rapid+Scoreboard;Professional+%C2%B7+Premium+%C2%B7+Fast+%C2%B7+Free" alt="Typing SVG" />

<h3>🚀 The Ultimate Scoring & Management System for Badminton Lovers</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.0.1-6839E8?style=for-the-badge&logo=semver&logoColor=white" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-27F05C?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License">
  <img src="https://img.shields.io/badge/Adaptive-All_Platforms-00D9FF?style=for-the-badge&logo=skype&logoColor=white" alt="Platform">
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/TryWorld2026/badmintonrapidscoreboard?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/TryWorld2026/badmintonrapidscoreboard?style=social" alt="Forks">
  <img src="https://img.shields.io/github/last-commit/TryWorld2026/badmintonrapidscoreboard?color=00CEC9" alt="Last Commit">
</p>

---

[🌐 Live Demo](https://tryworld2026.github.io/badmintonrapidscoreboard/) | [✨ Features](#-features) | [🚀 Quick Start](#-quick-start) | [❓ FAQ](#-faq)

</div>

## 🌟 Why It's Exceptional?

This is more than just a scoreboard; it's a comprehensive ecosystem for managing your badminton activities.

<table>
<tr>
<td width="33%">

### 💎 Pure Aesthetics
**Glassmorphism 2.0**  
Crafted with cutting-edge frosted glass design language and Teko tech-style fonts. Every pixel is meticulously polished.

</td>
<td width="33%">

### 📱 Touch Pioneer
**Mobile-First Layout**  
Optimized with full-width buttons and floating navigation. Perform complex operations effortlessly with one hand.

</td>
<td width="33%">

### 📊 Deep Insights
**Data-Driven Analysis**  
Integrated with Chart.js to provide skill radar charts and win rate trends, analyzing your game beyond just numbers.

</td>
</tr>
<tr>
<td width="33%">

### 👥 Smart Scheduling
**Fair Grouping Algorithm**  
Supports Random, Balanced, and Rotation modes. Say goodbye to the awkwardness of "fixed partners".

</td>
<td width="33%">

### 💰 Bill Master
**One-Click Cost Splitting**  
Built-in AA calculator for court fees, shuttles, and drinks. Generate and share beautiful bills instantly.

</td>
<td width="33%">

### 🔐 Zero-Risk Privacy
**100% Offline Execution**  
Data is stored strictly in your browser's LocalStorage. No server uploads, total privacy protection.

</td>
</tr>
</table>

---

## ✨ Core Features

### 🏸 Professional Scoring System
- **Real-time Timer**: Precisely record the duration of every match.
- **Undo Mechanism**: Unlimited undos to prevent accidental score touches.
- **Auto-Judgment**: Handles Deuce up to 30 points, strictly following BWF rules.
- **Victory FX**: Stunning full-screen effects and achievement unlock notifications.

### 👥 Intelligent Grouping & Finance
- **Multiple Modes**: Random, Skill-Balanced (strong-weak pairing), and Round Robin.
- **Expense Calculator**: Set totals, split by head, or use custom ratios. Copy results with one click.

### 📊 Personal Performance Profile
- **Radar Analysis**: Visualize your Stamina, Technique, Defense, and Mentality.
- **Leaderboards**: Real-time rankings based on win rate, matches played, and duration.
- **Achievement System**: 12 beautifully designed badges tracking your journey from "Rookie" to "Badminton King".

---

## 🎨 Visual Themes

Choose from 6 professionally tuned themes to suit your environment:

- 💜 **Night Purple**: Deep and mysterious, the ultimate tech vibe.
- 🧡 **Vibrant Orange**: Ignites your fighting spirit for intense matches.
- 💙 **Sky Blue**: Fresh and natural, providing the best reading experience.
- 💚 **Forest Green**: Soft on the eyes, reduces fatigue during long sessions.
- 💗 **Sakura Pink**: Elegant and delicate, a favorite among female players.
- 🖤 **Black Gold**: Noble and classic, representing professional quality.

---

## 🚀 Quick Start

### Option A: Instant Use (Recommended) ⭐
Click the [Live Demo](https://tryworld2026.github.io/badmintonrapidscoreboard/) link to start your first match directly in your browser.

### Option B: Local Deployment
```bash
# Clone the repository
git clone https://github.com/TryWorld2026/badmintonrapidscoreboard.git

# Enter the directory
cd badmintonrapidscoreboard

# Start with Python (Recommended for best PWA experience)
python -m http.server 8000
```

---

## 🛠️ Tech Stack

Built on the **"Vanilla First"** principle, achieving powerful features with minimal footprint:

- **Core**: HTML5, CSS3 (Modern Flex & Grid), ES6+ JavaScript
- **Charts**: [Chart.js](https://www.chartjs.org/) - Powerful data visualization
- **Rendering**: [html2canvas](https://html2canvas.hertzen.com/) - High-quality share card generation
- **Storage**: LocalStorage & SessionStorage

---

## 🧪 Regression Tests

The project ships a zero-dependency regression suite: it opens an iframe loading the **real** `index.html`, so assertions run against the shipped artifact itself (the same `App` namespace, the same DOM) rather than a DOM stand-in — a stand-in only proves the stand-in works.

```bash
# Must be served over http (under file:// the iframe cannot reach App cross-origin,
# and the Service Worker never registers)
python -m http.server 8899

# Then open in a browser
# http://127.0.0.1:8899/test.html
```

The cases cover scoring rules, saved-state normalization, expense splitting, overlays, visual tokens and the PWA — each traced back to a defect in `REFACTOR_NOTES.md`, specifically guarding against the class of bug that regresses silently: a switch that exists but never participates in the decision.

---

## 🤝 Contributing

We warmly welcome developers to join us!

1. **Fork** the repo
2. **Create** your feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to use, modify, and distribute.

---

<div align="center">

### 👨‍💻 Author
**TryWorld**  
Love Coding, Love Badminton 🏸

[![GitHub](https://img.shields.io/badge/GitHub-TryWorld2026-181717?style=for-the-badge&logo=github)](https://github.com/TryWorld2026)

**If this project helped you, please give it a ⭐ Star!**

<img src="https://api.star-history.com/svg?repos=TryWorld2026/badmintonrapidscoreboard&type=Date" alt="Star History Chart" width="600">

</div>