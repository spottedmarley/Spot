import * as readline from 'readline';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

export async function select(
  prompt: string,
  options: string[],
  currentIndex?: number
): Promise<string | null> {
  return new Promise((resolve) => {
    let selectedIndex = currentIndex ?? 0;

    // Enable raw mode for keypress detection
    if (!process.stdin.isTTY) {
      resolve(null);
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    const render = () => {
      // Clear previous render
      process.stdout.write('\x1b[?25l'); // Hide cursor

      // Move up to overwrite previous options
      if (options.length > 0) {
        process.stdout.write(`\x1b[${options.length}A`);
      }

      // Render options
      options.forEach((opt, i) => {
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? `${colors.green}❯${colors.reset}` : ' ';
        const text = isSelected ? `${colors.bright}${opt}${colors.reset}` : `${colors.dim}${opt}${colors.reset}`;
        process.stdout.write(`\x1b[2K${prefix} ${text}\n`);
      });
    };

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('keypress', onKeypress);
      process.stdout.write('\x1b[?25h'); // Show cursor
    };

    const onKeypress = (str: string | undefined, key: readline.Key) => {
      if (key.name === 'up' || key.name === 'k') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(options[selectedIndex] ?? null);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        // Clear the options display
        process.stdout.write(`\x1b[${options.length}A`);
        options.forEach(() => process.stdout.write('\x1b[2K\n'));
        process.stdout.write(`\x1b[${options.length}A`);
        resolve(null);
      }
    };

    // Print prompt
    console.log(`${colors.cyan}${prompt}${colors.reset}`);
    console.log(`${colors.dim}↑/↓ to move, Enter to select, Esc to cancel${colors.reset}`);
    console.log();

    // Initial render (print blank lines first)
    options.forEach(() => console.log());
    render();

    process.stdin.on('keypress', onKeypress);
  });
}
