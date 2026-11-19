# Epizen menu bar rehearsal

The Panel Annotation example supplied the panel-over-workspace composition. The wide scene uses a quiet calendar grid behind the actual Epizen tray component. The compact scene gives the tray the full frame. Both use Epizen’s dark palette and fixture tasks.

The pointer pauses the stopwatch, holds the paused state, resumes, and returns offstage. The panel’s fixed-width timer controls keep the readout and buttons aligned across the change. The reduced-motion poster shows the running state without the cursor.

Captured at viewport widths 920 and 390. The Stageshow gates printed `rehearsal passed` for both loops, the marked states, and the reduced-motion stills. Some loop recordings missed animation frames. The marked states and close-ups were used to inspect the Pause and Resume label change separately.

- `evidence/tray-stageshow.png` and `evidence/tray-compact.png` show the panel at rest.
- `evidence/tray-states-wide.png` and `evidence/tray-states.png` show the timer states.
- `evidence/tray-sound.png` shows the sound controls during local Web Audio playback.
- `evidence/tray-clock.png` shows the native clock raster at 2× and enlarged.

The headless browser exercised starting, switching, and stopping both sounds, including collapsing the controls during playback. Native menu bar placement, WKWebView playback with the panel hidden, and the desktop navigation journey are deferred because the built-in display did not have a verified Desktop 2.

From the skill directory, run the playground with `npm run dev` and open the example with `?capture=epizen-menu-bar`. The example uses the worktree’s installed frontend dependencies.
