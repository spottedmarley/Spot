const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
}

export async function select(
	prompt: string,
	options: string[],
	currentIndex?: number
): Promise<string | null> {
	return new Promise((resolve) => {
		let selectedIndex = currentIndex ?? 0

		if (!process.stdin.isTTY) {
			resolve(null)
			return
		}

		// Save original stdin state
		const wasRaw = process.stdin.isRaw

		process.stdin.setRawMode(true)
		process.stdin.resume()

		const render = () => {
			process.stdout.write('\x1b[?25l') // Hide cursor

			// Move up to overwrite previous options
			if (options.length > 0) {
				process.stdout.write(`\x1b[${options.length}A`)
			}

			// Render options
			options.forEach((opt, i) => {
				const isSelected = i === selectedIndex
				const prefix = isSelected ? `${colors.green}❯${colors.reset}` : ' '
				const text = isSelected ? `${colors.bright}${opt}${colors.reset}` : `${colors.dim}${opt}${colors.reset}`
				process.stdout.write(`\x1b[2K${prefix} ${text}\n`)
			})
		}

		const cleanup = () => {
			process.stdin.setRawMode(wasRaw ?? false)
			process.stdin.removeListener('data', onData)
			process.stdout.write('\x1b[?25h') // Show cursor
		}

		let escapeBuffer = ''

		const onData = (data: Buffer) => {
			const str = data.toString()

			for (const char of str) {
				// Handle escape sequences
				if (escapeBuffer.length > 0 || char === '\x1b') {
					escapeBuffer += char

					// Check for complete escape sequences
					if (escapeBuffer === '\x1b[A') {
						// Up arrow
						selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1
						render()
						escapeBuffer = ''
					} else if (escapeBuffer === '\x1b[B') {
						// Down arrow
						selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0
						render()
						escapeBuffer = ''
					} else if (escapeBuffer === '\x1b') {
						// Just escape, wait for more chars or timeout
						setTimeout(() => {
							if (escapeBuffer === '\x1b') {
								// Standalone escape - cancel
								cleanup()
								process.stdout.write(`\x1b[${options.length}A`)
								options.forEach(() => process.stdout.write('\x1b[2K\n'))
								process.stdout.write(`\x1b[${options.length}A`)
								resolve(null)
								escapeBuffer = ''
							}
						}, 50)
					} else if (escapeBuffer.length >= 3) {
						// Unknown escape sequence, clear buffer
						escapeBuffer = ''
					}
					continue
				}

				// Regular characters
				if (char === '\r' || char === '\n') {
					// Enter
					cleanup()
					resolve(options[selectedIndex] ?? null)
					return
				} else if (char === '\x03') {
					// Ctrl+C
					cleanup()
					process.stdout.write(`\x1b[${options.length}A`)
					options.forEach(() => process.stdout.write('\x1b[2K\n'))
					process.stdout.write(`\x1b[${options.length}A`)
					resolve(null)
					return
				} else if (char === 'k' || char === 'K') {
					selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1
					render()
				} else if (char === 'j' || char === 'J') {
					selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0
					render()
				}
			}
		}

		// Print prompt
		console.log(`${colors.cyan}${prompt}${colors.reset}`)
		console.log(`${colors.dim}↑/↓ to move, Enter to select, Esc to cancel${colors.reset}`)
		console.log()

		// Initial render (print blank lines first)
		options.forEach(() => console.log())
		render()

		process.stdin.on('data', onData)
	})
}
