# VHS tape script -- generates the README demo GIF reproducibly from real
# hopchat output instead of a manually-recorded screen capture that goes
# stale the next time the CLI's output changes.
#
# Install VHS: https://github.com/charmbracelet/vhs
# Render:      vhs demo.tape        (produces demo.gif)

Output demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 900
Set Height 560
Set Theme "Dracula"
Set TypingSpeed 40ms

Type "hopchat migrate --from copilot-cli --to claude-code 1d5a6952-f893-4173-8aaa-d51876acf5c0"
Sleep 500ms
Enter
Sleep 4s

Type "hopchat platforms"
Sleep 300ms
Enter
Sleep 1.5s
