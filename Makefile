.PHONY: test
test:
	bash test/install.test.sh
	CLAUDE_LIMITS_REPO=$${CLAUDE_LIMITS_REPO:-$$HOME/claude-limits} node --test test/plugin.test.js
