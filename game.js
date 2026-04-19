// ─────────────────────────────────────────────
//  Elemental Wars – Tutorial Level
//  Phaser 3.60  |  32×32 sprite world
// ─────────────────────────────────────────────

const SCALE = 3;
const TILE  = 32;
const TS    = TILE * SCALE;   // 96px display per tile

// ── PreloadScene ────────────────────────────
class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    this.load.spritesheet('player_idle',   'assets/idle.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_walk',   'assets/walk.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_jump',   'assets/jump.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_attack', 'assets/attack.png', { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_duck',   'assets/duck.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('dummy',         'assets/dummy.png',  { frameWidth: 27, frameHeight: 25 });
    this.load.spritesheet('chest',         'assets/chest.png',  { frameWidth: 14, frameHeight: 16 });
    this.load.image('ground',   'assets/ground.png');
    this.load.image('dirt',     'assets/dirt.png');
    this.load.image('platform', 'assets/platform.png');
    this.load.image('spike',    'assets/spike.png');
  }

  create() {
    this.buildFallbacks();
    this.scene.start('MenuScene');
  }

  buildFallbacks() {
    const makeSheet = (key, col, nf, fw = 32, fh = 32) => {
      if (this.textures.exists(key)) return;
      const cv = document.createElement('canvas');
      cv.width = fw * nf; cv.height = fh;
      const cx = cv.getContext('2d');
      const r = (col>>16)&0xff, g = (col>>8)&0xff, b = col&0xff;
      for (let i = 0; i < nf; i++) {
        cx.fillStyle = `rgb(${r},${g},${b})`;
        cx.fillRect(i*fw, 0, fw, fh);
        cx.strokeStyle = 'rgba(0,0,0,0.3)';
        cx.strokeRect(i*fw+.5, .5, fw-1, fh-1);
      }
      const tex = this.textures.addCanvas(key, cv);
      for (let i = 0; i < nf; i++) tex.add(i, 0, i*fw, 0, fw, fh);
    };
    const makeImg = (key, col, w = 32, h = 32) => {
      if (this.textures.exists(key)) return;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.fillStyle = `rgb(${(col>>16)&0xff},${(col>>8)&0xff},${col&0xff})`;
      cx.fillRect(0, 0, w, h);
      this.textures.addCanvas(key, cv);
    };
    makeSheet('player_idle',   0x4488ff, 1, 18, 31);
    makeSheet('player_walk',   0x4488ff, 4, 18, 31);
    makeSheet('player_jump',   0x44aaff, 3, 18, 31);
    makeSheet('player_attack', 0xff8844, 4, 18, 31);
    makeSheet('player_duck',   0x2266cc, 1, 18, 31);
    makeSheet('dummy',         0xcc4444, 2, 27, 25);
    makeSheet('chest',         0xcc9922, 2, 14, 16);
    makeImg  ('ground',        0x4a9944, 32, 32);
    makeImg  ('dirt',          0x3d2008, 32, 32);
    makeImg  ('platform',      0x8b5e3c, 32,  6);
    makeImg  ('spike',         0xddddcc,  8,  8);  // 8×8 fallback
    makeImg  ('dust',          0xd4c4a8,  4,  4);
  }
}

// ── MenuScene ────────────────────────────────
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0xeef8ff).setOrigin(0);

    const cg = this.add.graphics();
    cg.fillStyle(0xffffff, 0.9);
    [[90,75,130,44],[280,52,100,36],[500,85,150,48],[680,58,110,38],[760,110,90,32]]
      .forEach(([x,y,w,h]) => {
        cg.fillEllipse(x,y,w,h);
        cg.fillEllipse(x-w*.22,y-h*.28,w*.55,h*.65);
        cg.fillEllipse(x+w*.18,y-h*.22,w*.50,h*.60);
      });

    this.add.rectangle(0, height-54, width, 54, 0x6dbf67).setOrigin(0);
    this.add.rectangle(0, height-54, width,  9, 0x52a84f).setOrigin(0);

    this.add.text(width/2, height/2-90, 'ELEMENTAL WARS', {
      fontSize: '42px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ff5722', stroke: '#ffffff', strokeThickness: 7
    }).setOrigin(0.5);

    this.add.text(width/2, height/2-38, 'Tutorial Level', {
      fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#2d6a4f'
    }).setOrigin(0.5);

    const btn = this.add.text(width/2, height/2+28, '  PLAY  ', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', backgroundColor: '#ff5722', padding: { x:28, y:13 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#e64a19' }));
    btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#ff5722' }));
    btn.on('pointerup',   () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));

    this.add.text(width/2, height-24,
      'Arrow keys / WASD  ·  ↑/W = jump (×2)  ·  ↓/S = duck  ·  E or , = attack',
      { fontSize:'11px', fontFamily:'monospace', color:'#2d6a4f' }
    ).setOrigin(0.5);
  }
}

// ── GameScene ────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    const WORLD_W   = 3600;
    const WORLD_H   = 1200;
    const floorY    = WORLD_H - 4 * TS;       // grass tile centre  y = 816
    const groundTop = floorY - TS / 2;         // grass surface      y = 768

    this._respawnX    = 120;
    this._respawnY    = groundTop - 120;
    this._spikeHit    = false;
    this._wasOnGround = true;
    this._squashActive = false;   // true while squash tween is running (prevents re-trigger)
    this._ssTween      = null;    // holds the active squash OR stretch tween reference

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + TS * 2);
    this.cameras.main.setBackgroundColor(0xeef8ff);
    this.addBackground(WORLD_W, WORLD_H);

    // Level + entities
    this.platforms = this.physics.add.staticGroup();
    this.buildLevel(WORLD_W, WORLD_H, floorY);

    this.player = this.createPlayer(this._respawnX, this._respawnY);
    this.dummy  = this.createDummy(1800, groundTop - 25 * SCALE / 2);
    this.chest  = this.createChest(3000, groundTop - 16 * 5 / 2);   // scale=5 used below

    this.spikes = this.physics.add.staticGroup();
    this.buildSpikes(floorY);

    // Colliders
    this.physics.add.collider(this.player.sprite, this.platforms);
    this.physics.add.collider(this.dummy.sprite,  this.platforms);
    this.physics.add.collider(this.chest.sprite,  this.platforms);

    // Make dummy and chest solid — without these the player passes right through
    this.physics.add.collider(this.player.sprite, this.dummy.sprite);
    this.physics.add.collider(this.player.sprite, this.chest.sprite);
    this.physics.add.overlap(
      this.player.sprite, this.spikes,
      () => this.respawnPlayer(), null, this
    );

    // ── Camera ───────────────────────────────────────────────────────
    // followOffset(0, +181): Phaser subtracts the offset from the target,
    // so +181 lifts the camera focus 181 world-units ABOVE the player,
    // giving ~75% sky / 20% ground on screen (Dadish look).
    this.cameras.main.setZoom(0.65);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.10);
    // +107 lifts camera focus above player so ground occupies ~30% of screen height
    this.cameras.main.setFollowOffset(0, 107);

    // Input
    this.keys = this.input.keyboard.addKeys({
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      comma: Phaser.Input.Keyboard.KeyCodes.COMMA,
    });
    this._jumpHeld = false;
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._dummyDialogTriggered = false;

    this.buildAnims();
    this.player.sprite.anims.play('idle', true);
    this.dummy.sprite.anims.play('dummy_idle', true);
    this.chest.sprite.anims.play('chest_closed', true);
    this.buildHUD();

    this.buildDialogBox();

    // ── Dust particle emitter (jump & land bursts) ────────────────
    this.dustEmitter = this.add.particles(0, 0, 'dust', {
      lifespan:  380,
      speed:     { min: 30, max: 110 },
      angle:     { min: 160, max: 380 },   // mostly sideways / upward arc
      scale:     { start: 1.8, end: 0 },
      alpha:     { start: 0.75, end: 0 },
      gravityY:  400,
      emitting:  false,
    }).setDepth(2);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Background
  // ─────────────────────────────────────────────────────────────────
  addBackground(worldW, worldH) {
    const clouds = this.add.graphics().setScrollFactor(0.15).setDepth(-8);
    clouds.fillStyle(0xffffff, 0.92);
    [
      [230, 130, 140, 48], [620, 100, 108, 38], [980, 175, 165, 54],
      [1360, 115, 125, 44], [1730, 200, 150, 52], [2110, 110, 115, 40],
      [2480, 155, 158, 50], [2860, 120, 128, 45], [3210, 185, 145, 50],
    ].forEach(([cx, cy, cw, ch]) => {
      clouds.fillEllipse(cx,             cy,            cw,        ch);
      clouds.fillEllipse(cx - cw * 0.22, cy - ch * 0.28, cw * 0.55, ch * 0.65);
      clouds.fillEllipse(cx + cw * 0.18, cy - ch * 0.22, cw * 0.50, ch * 0.60);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Level layout
  //
  //  Tile map (TS = 96px display each):
  //    [0-10]  grass section 1   right edge x=1008
  //    [11-12] PIT 1             x 1008→1200
  //    [13-20] grass section 2   right edge x=1968
  //    [21-22] PIT 2             x 1968→2160
  //    [23-30] grass section 3   right edge x=2928
  //    [31-32] PIT 3             x 2928→3120
  //    [33-37] grass section 4
  // ─────────────────────────────────────────────────────────────────
  buildLevel(worldW, worldH, floorY) {
    const grass = (startX, cols) => {
      for (let i = 0; i < cols; i++)
        this.platforms.create(startX + i * TS, floorY, 'ground').setScale(SCALE).refreshBody();
    };
    const dirtRow = (y, cols) => {
      for (let i = 0; i < cols; i++)
        this.platforms.create(i * TS, y, 'dirt').setScale(SCALE).refreshBody();
    };
    const plat = (x, y) =>
      this.platforms.create(x, y, 'platform').setScale(SCALE).refreshBody();

    grass(0,        11);   // tiles  0-10
    grass(13 * TS,   8);   // tiles 13-20
    grass(23 * TS,   8);   // tiles 23-30
    grass(33 * TS,   5);   // tiles 33-37

    const totalCols = Math.ceil(worldW / TS) + 1;
    for (let row = 1; row <= 4; row++) dirtRow(floorY + row * TS, totalCols);

    // Platforms — bridge above each pit + mid-section steps
    plat( 5 * TS, floorY - 1 * TS);
    plat(12 * TS, floorY - 2 * TS);   // bridge over pit 1
    plat(17 * TS, floorY - 1 * TS);
    plat(22 * TS, floorY - 2 * TS);   // bridge over pit 2
    plat(27 * TS, floorY - 1 * TS);
    plat(33 * TS, floorY - 2 * TS);   // approach to chest
  }

  // ─────────────────────────────────────────────────────────────────
  //  Spikes — 8×8 texture at SCALE=3 → 24px display each.
  //  Packed edge-to-edge (step=24) so no gap exists to walk through.
  //
  //  Pit edges (world x):
  //    Pit 1: 1008 – 1200  (192px → 8 spikes)
  //    Pit 2: 1968 – 2160  (192px → 8 spikes)
  //    Pit 3: 2928 – 3120  (192px → 8 spikes)
  // ─────────────────────────────────────────────────────────────────
  buildSpikes(floorY) {
    const SW = 8 * SCALE;                    // spike display width  = 24
    const SH = 8 * SCALE;                    // spike display height = 24
    const pitFloor = floorY + TS / 2;        // top of dirt row 1   = 864
    const spikeY   = pitFloor - SH / 2;      // sprite centre        = 852

    const pitEdges = [
      [10 * TS + TS / 2, 13 * TS - TS / 2],  // 1008 → 1200
      [20 * TS + TS / 2, 23 * TS - TS / 2],  // 1968 → 2160
      [30 * TS + TS / 2, 33 * TS - TS / 2],  // 2928 → 3120
    ];

    pitEdges.forEach(([left, right]) => {
      for (let x = left + SW / 2; x < right; x += SW) {
        const s = this.spikes.create(x, spikeY, 'spike');
        s.setScale(SCALE);
        // Physics body = upper 6×6 texture units (the dangerous tip)
        s.body.setSize(6, 6).setOffset(1, 0);
        s.refreshBody();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Respawn on spike contact
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  //  Squash-and-stretch helpers
  //
  //  Rules that prevent the three bugs:
  //  • Only ONE tween (_ssTween) runs at a time — stopped via its own
  //    reference so we NEVER call killTweensOf (which would kill the
  //    invincibility tween and leave _spikeHit = true forever).
  //  • _squashActive flag blocks re-triggering while the squash runs,
  //    stopping the spam+phase loop caused by the body briefly lifting.
  //  • stretchPlayer clears _squashActive before stopping the tween so
  //    a mid-squash jump doesn't leave the flag stuck on.
  // ─────────────────────────────────────────────────────────────────
  squashPlayer() {
    if (this._squashActive) return;          // already squashing — skip
    this._squashActive = true;
    if (this._ssTween) { this._ssTween.stop(); this._ssTween = null; }
    const s = this.player.sprite;
    // dust burst at feet on landing
    this.dustEmitter?.explode(8, s.x, s.body.bottom);
    s.setScale(SCALE);
    this._ssTween = this.tweens.add({
      targets: s,
      scaleX: SCALE * 1.1,
      scaleY: SCALE * 0.95,
      duration: 55,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => { s.setScale(SCALE); this._squashActive = false; this._ssTween = null; },
    });
  }

  stretchPlayer() {
    this._squashActive = false;              // jump cancels any ongoing squash
    if (this._ssTween) { this._ssTween.stop(); this._ssTween = null; }
    const s = this.player.sprite;
    // dust burst at feet on jump launch
    this.dustEmitter?.explode(5, s.x, s.body.bottom);
    s.setScale(SCALE);
    this._ssTween = this.tweens.add({
      targets: s,
      scaleX: SCALE * 0.95,
      scaleY: SCALE * 1.1,
      duration: 90,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => { s.setScale(SCALE); this._ssTween = null; },
    });
  }

  respawnPlayer() {
    if (this._spikeHit) return;
    this._spikeHit = true;

    const p = this.player;
    p.isAttacking = false;
    p.sprite.body.setVelocity(0, 0);
    // Stop only the squash/stretch tween — never killTweensOf (would kill invincibility tween)
    if (this._ssTween) { this._ssTween.stop(); this._ssTween = null; }
    this._squashActive = false;
    p.sprite.setScale(SCALE);
    p.sprite.setTintFill(0xff4444);
    this.cameras.main.shake(140, 0.009);

    this.time.delayedCall(280, () => {
      p.sprite.clearTint();
      p.sprite.setPosition(this._respawnX, this._respawnY);
      p.sprite.body.setVelocity(0, 0);
      p.jumpsLeft = 2;
      this._wasOnGround = true;   // prevent phantom land-squash on respawn

      this.tweens.add({
        targets: p.sprite, alpha: 0.35,
        duration: 75, yoyo: true, repeat: 7,
        onComplete: () => { p.sprite.setAlpha(1); this._spikeHit = false; }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Player / Dummy / Chest
  // ─────────────────────────────────────────────────────────────────
  createPlayer(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'player_idle')
      .setScale(SCALE).setCollideWorldBounds(true).setFlipX(true);
    sprite.body.setSize(14, 27).setOffset(2, 2);
    return { sprite, jumpsLeft: 2, isAttacking: false, attackCooldown: 0 };
  }

  createDummy(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'dummy').setScale(SCALE).setImmovable(true);
    sprite.body.setAllowGravity(false).setSize(23, 23).setOffset(2, 1);
    const maxHp = 5;
    return { sprite, hp: maxHp, maxHp, dead: false };
  }

  createChest(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'chest').setScale(5).setImmovable(true);
    sprite.body.setAllowGravity(false).setSize(12, 14).setOffset(1, 1);
    return { sprite, opened: false };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Animations
  // ─────────────────────────────────────────────────────────────────
  buildAnims() {
    const add = (key, sheet, s, e, fps, repeat = -1) => {
      if (!this.anims.exists(key))
        this.anims.create({ key, frameRate: fps, repeat,
          frames: this.anims.generateFrameNumbers(sheet, { start:s, end:e }) });
    };
    add('idle',         'player_idle',   0, 0,  4);
    add('walk',         'player_walk',   0, 3,  8);
    add('jump',         'player_jump',   0, 2,  6, 0);
    add('attack',       'player_attack', 0, 3, 12, 0);
    add('duck',         'player_duck',   0, 0,  4);
    add('dummy_idle',   'dummy',         0, 0,  4);
    add('dummy_hit',    'dummy',         1, 1,  4, 0);
    add('chest_closed', 'chest',         0, 0,  4);
    add('chest_open',   'chest',         1, 1,  4, 0);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dialog system
  //
  //  Layout (canvas coords, scrollFactor 0):
  //    When PLAYER speaks  → portrait square LEFT,  gray text area RIGHT
  //    When OTHER speaks   → gray text area LEFT,   portrait square RIGHT
  //
  //  showDialog(entries) – entries: [{ speaker:'player'|'dummy', text:'...' }, ...]
  //  Space advances through entries, then closes the box.
  // ─────────────────────────────────────────────────────────────────
  buildDialogBox() {
    const W  = this.scale.width;   // 800
    const H  = this.scale.height;  // 480
    const BH = 100;                // box height
    const BX = 20;
    const BY = H - BH - 10;       // 370 — bottom of screen with gap
    const BW = W - BX * 2;        // 760
    const PS = 100;                // portrait square width (= BH so it's square)

    // Background graphics (redrawn per entry)
    const gfx = this.add.graphics().setScrollFactor(0).setDepth(20).setVisible(false);

    // Portrait image — reuses existing sprite textures cropped to the square
    const portrait = this.add.image(0, 0, 'player_idle', 0)
      .setScrollFactor(0).setDepth(22).setVisible(false);

    // Dialogue text
    const txt = this.add.text(0, 0, '', {
      fontSize: '13px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#111111',
      wordWrap: { width: BW - PS - 28, useAdvancedWrap: true },
      lineSpacing: 5,
    }).setScrollFactor(0).setDepth(22).setVisible(false);

    // "Press SPACE" hint — tiny, bottom-right of the box
    const hint = this.add.text(BX + BW - 6, BY + BH - 6, '[SPACE]', {
      fontSize: '10px', fontFamily: 'monospace', color: '#555555',
    }).setScrollFactor(0).setDepth(22).setOrigin(1, 1).setVisible(false);

    // Proximity prompt shown in world space above dummy
    const prompt = this.add.text(0, 0, '[SPACE]', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
      backgroundColor: '#000000bb', padding: { x: 5, y: 2 },
    }).setDepth(15).setOrigin(0.5, 1).setVisible(false);

    this._dialog = { active: false, queue: [], gfx, portrait, txt, hint, prompt,
                     BX, BY, BW, BH, PS };
  }

  // entries: [{ speaker: 'player'|'dummy', text: '...' }, ...]
  showDialog(entries) {
    this._dialog.queue = entries.slice();
    this._dialog.active = true;
    this._dialog.prompt.setVisible(false);
    this._advanceDialog();
  }

  _advanceDialog() {
    const d = this._dialog;
    if (d.queue.length === 0) { this._closeDialog(); return; }
    const { speaker, text } = d.queue.shift();
    this._renderDialogEntry(speaker, text);
  }

  _renderDialogEntry(speaker, text) {
    const d = this._dialog;
    const { BX, BY, BW, BH, PS } = d;
    const isPlayer = speaker === 'player';

    // ── Draw background panels ─────────────────────────────────────
    d.gfx.clear().setVisible(true);

    // Outer border/shadow
    d.gfx.fillStyle(0x222222, 1);
    d.gfx.fillRect(BX - 3, BY - 3, BW + 6, BH + 6);

    if (isPlayer) {
      // Black portrait square LEFT
      d.gfx.fillStyle(0x111111, 1);
      d.gfx.fillRect(BX, BY, PS, BH);
      // Gray text area RIGHT
      d.gfx.fillStyle(0xd8d4c0, 1);
      d.gfx.fillRect(BX + PS, BY, BW - PS, BH);

      // Portrait — player idle sprite, centred in square
      d.portrait.setTexture('player_idle', 0)
        .setScale(3.5).setFlipX(true)
        .setPosition(BX + PS / 2, BY + BH / 2)
        .setVisible(true);

      // Text — right side
      d.txt.setPosition(BX + PS + 14, BY + 14)
        .setStyle({ wordWrap: { width: BW - PS - 28 } });
    } else {
      // Gray text area LEFT
      d.gfx.fillStyle(0xd8d4c0, 1);
      d.gfx.fillRect(BX, BY, BW - PS, BH);
      // Black portrait square RIGHT
      d.gfx.fillStyle(0x111111, 1);
      d.gfx.fillRect(BX + BW - PS, BY, PS, BH);

      // Portrait — dummy sprite, centred in square
      d.portrait.setTexture('dummy', 0)
        .setScale(3.5).setFlipX(false)
        .setPosition(BX + BW - PS / 2, BY + BH / 2)
        .setVisible(true);

      // Text — left side
      d.txt.setStyle({ wordWrap: { width: BW - PS - 28 } })
        .setPosition(BX + 14, BY + 14);
    }

    d.txt.setText(text).setVisible(true);
    d.hint.setVisible(true);
  }

  _closeDialog() {
    const d = this._dialog;
    d.active = false;
    d.gfx.clear().setVisible(false);
    d.portrait.setVisible(false);
    d.txt.setVisible(false);
    d.hint.setVisible(false);
  }

  // Show proximity prompt above dummy head; auto-trigger dialog on first approach
  _checkDummyProximity() {
    if (this.dummy.dead || this._dummyDialogTriggered) {
      this._dialog.prompt.setVisible(false);
      return;
    }
    const dist = Math.abs(this.player.sprite.x - this.dummy.sprite.x);
    const inRange = dist < 160;

    this._dialog.prompt
      .setVisible(inRange && !this._dialog.active)
      .setPosition(this.dummy.sprite.x, this.dummy.sprite.y - 55);

    if (inRange && !this._dialog.active) {
      this._dummyDialogTriggered = true;
      this.showDialog([
        { speaker: 'dummy',  text: 'Hello.' },
        { speaker: 'player', text: 'Hello to you, too.' },
      ]);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  HUD
  // ─────────────────────────────────────────────────────────────────
  buildHUD() {
    const barBg    = this.add.rectangle(0, 0, 80, 10, 0x220000).setOrigin(0.5, 1);
    const barFg    = this.add.rectangle(0, 0, 80, 10, 0xff3333).setOrigin(0,   1);
    const barLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb'
    }).setOrigin(0.5, 1);
    this.dummyBar = { bg: barBg, fg: barFg, label: barLabel };

    const { width, height } = this.scale;
    this.add.text(width/2, 18,
      'Arrow/WASD = move   ↑/W = jump (×2)   ↓/S = duck   E or , = attack',
      { fontSize:'11px', fontFamily:'monospace',
        color:'#1a3a5c', backgroundColor:'#ffffffcc', padding:{x:10,y:5} }
    ).setOrigin(0.5, 0).setScrollFactor(0);

    this.victoryText = this.add.text(width/2, height/2, '  Level Complete!  ', {
      fontSize:'36px', fontFamily:'"Arial Black", Arial, sans-serif',
      color:'#ff5722', stroke:'#ffffff', strokeThickness:6,
      backgroundColor:'#ffffffcc', padding:{x:24,y:14}
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(10);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Update loop
  // ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    // Space advances or closes the dialog box
    if (this._dialog.active) {
      if (Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
        this._advanceDialog();
      }
      this.updateDummyBar();
      return;   // freeze all other input while dialog is open
    }

    this.updatePlayer(delta);
    this.updateDummyBar();
    this._checkDummyProximity();
  }

  updatePlayer(delta) {
    const p = this.player, s = p.sprite, bod = s.body, k = this.keys;
    const onGround = bod.blocked.down;
    if (onGround) p.jumpsLeft = 2;
    if (p.attackCooldown > 0) p.attackCooldown -= delta;

    // ── Squash on landing ─────────────────────────────────────────
    // _squashActive guard stops re-triggering while the tween is still running
    if (onGround && !this._wasOnGround && !this._squashActive) this.squashPlayer();
    this._wasOnGround = onGround;

    if (p.isAttacking) { this.applyHorizontalMove(p, k, 0.6); return; }

    if ((k.e.isDown || k.comma.isDown) && p.attackCooldown <= 0) {
      p.isAttacking = true; p.attackCooldown = 600;
      s.anims.play('attack', true);
      s.once('animationcomplete-attack', () => { p.isAttacking = false; });
      this.time.delayedCall(200, () => this.checkAttackHit());
      return;
    }

    const jp = k.up.isDown || k.w.isDown;
    if (jp && !this._jumpHeld && p.jumpsLeft > 0) {
      bod.setVelocityY(-Math.sqrt(2 * Math.abs(this.physics.world.gravity.y) * TS));
      p.jumpsLeft--;
      s.anims.play('jump', true);
      // ── Stretch on jump launch ────────────────────────────────
      this.stretchPlayer();
    }
    this._jumpHeld = jp;

    if ((k.down.isDown || k.s.isDown) && onGround) {
      // Duck: play crouch anim but still allow slow horizontal movement
      s.anims.play('duck', true);
      this.applyHorizontalMove(p, k, 0.4);
      return;
    }

    this.applyHorizontalMove(p, k, 1);

    // Base animation off key state, not velocity, so it responds the instant
    // a direction key is pressed (no one-frame lag from the physics solver).
    const movingH = k.left.isDown || k.a.isDown || k.right.isDown || k.d.isDown;
    if (!onGround) {
      if (s.anims.currentAnim?.key !== 'jump') s.anims.play('jump', true);
    } else if (movingH) {
      s.anims.play('walk', true);
    } else {
      s.anims.play('idle', true);
    }
  }

  applyHorizontalMove(p, k, mult) {
    const spd = 200 * mult, s = p.sprite;
    if      (k.left.isDown  || k.a.isDown) { s.body.setVelocityX(-spd); s.setFlipX(false); }
    else if (k.right.isDown || k.d.isDown) { s.body.setVelocityX( spd); s.setFlipX(true);  }
    else                                    { s.body.setVelocityX(0); }
  }

  checkAttackHit() {
    const ps = this.player.sprite, reach = TS * 1.3;
    if (this.dummy && !this.dummy.dead) {
      const ds = this.dummy.sprite;
      const facing = ps.flipX ? ds.x > ps.x : ds.x < ps.x;
      if (Math.abs(ps.x-ds.x) < reach && Math.abs(ps.y-ds.y) < TS && facing) this.hitDummy();
    }
    if (this.chest && !this.chest.opened) {
      const cs = this.chest.sprite;
      const facing = ps.flipX ? cs.x > ps.x : cs.x < ps.x;
      if (Math.abs(ps.x-cs.x) < reach && Math.abs(ps.y-cs.y) < TS && facing) this.openChest();
    }
  }

  hitDummy() {
    const d = this.dummy;
    d.hp = Math.max(0, d.hp - 1);
    if (d.hp <= 0) {
      d.dead = true;
      d.sprite.anims.play('dummy_hit', true);
      this.time.delayedCall(150, () => {
        d.sprite.setTint(0x550000);
        this.tweens.add({ targets:d.sprite, angle:90, alpha:0, duration:400, ease:'Power2',
          onComplete: () => d.sprite.destroy() });
        this.dummyBar.bg.setVisible(false);
        this.dummyBar.fg.setVisible(false);
        this.dummyBar.label.setVisible(false);
      });
    } else {
      d.sprite.anims.play('dummy_hit', true);
      d.sprite.setTintFill(0xffffff);
      this.time.delayedCall(100, () => {
        if (!d.dead) { d.sprite.clearTint(); d.sprite.anims.play('dummy_idle', true); }
      });
    }
  }

  updateDummyBar() {
    if (this.dummy.dead) return;
    const ds = this.dummy.sprite, bar = this.dummyBar, barW = 80;
    const bx = ds.x, by = ds.y - 25*SCALE/2 - 8;
    bar.bg.setPosition(bx, by).setSize(barW, 10);
    bar.fg.setPosition(bx - barW/2, by).setSize(barW * this.dummy.hp / this.dummy.maxHp, 10);
    bar.label.setPosition(bx, by-10).setText(`HP: ${this.dummy.hp} / ${this.dummy.maxHp}`);
  }

  openChest() {
    const c = this.chest;
    if (c.opened) return;
    c.opened = true;
    c.sprite.anims.play('chest_open', true);
    this.tweens.add({ targets:c.sprite, scaleX:SCALE*1.2, scaleY:SCALE*1.2,
      duration:120, yoyo:true, repeat:2 });
    this.time.delayedCall(400, () => {
      this.victoryText.setVisible(true);
      this.time.delayedCall(2500, () => this.scene.start('MenuScene'));
    });
  }
}

// ── Boot ─────────────────────────────────────
// Phaser.Scale.FIT scales the 800×480 canvas to fill the browser window
// while maintaining aspect ratio.  backgroundColor matches the sky so
// any slim letterbox is invisible.
new Phaser.Game({
  type:   Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#eef8ff',
  pixelArt: true,
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  800,
    height: 480,
  },
  physics: { default:'arcade', arcade:{ gravity:{ y:600 }, debug:false } },
  scene:  [PreloadScene, MenuScene, GameScene]
});
