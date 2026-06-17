agent-browser click '@e3'
agent-browser wait 500
agent-browser click '@e7'
agent-browser wait 2000
agent-browser wait --load networkidle
agent-browser wait 1500
agent-browser screenshot --screenshot-dir ./docs/screenshots
