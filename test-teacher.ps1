agent-browser click '@e2'
agent-browser wait 500
agent-browser click '@e7'
agent-browser wait --url '**/dashboard'
agent-browser wait 2000
agent-browser screenshot --screenshot-dir ./docs/screenshots
