agent-browser open http://localhost:5173/
agent-browser wait --load networkidle
agent-browser wait 2000
agent-browser screenshot --screenshot-dir ./docs/screenshots
