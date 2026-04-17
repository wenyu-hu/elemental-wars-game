// ─────────────────────────────────────────────
//  Elemental Wars – Tutorial Level
//  Phaser 3.60  |  32×32 sprite world
// ─────────────────────────────────────────────

const SCALE   = 3;          // pixel-art upscale
const TILE    = 32;         // base tile size
const TS      = TILE * SCALE; // 96px on screen

// ── PreloadScene ────────────────────────────
class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    // ── Player spritesheets (single horizontal row, 32×32 frames) ──
    this.load.spritesheet('player_idle',   'assets/idle.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_walk',   'assets/walk.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_jump',   'assets/jump.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_attack', 'assets/attack.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_duck',   'assets/duck.png',   { frameWidth: 32, frameHeight: 32 });

    // ── Enemy / objects ──
    this.load.spritesheet('dummy',  'assets/dummy.png',  { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('chest',  'assets/chest.png',  { frameWidth: 32, frameHeight: 32 });

    // ── Tiles ──
    this.load.image('ground',   'assets/ground.png');
    this.load.image('platform', 'assets/platform.png');
  }

  create() {
    this.buildFallbacks();
    this.scene.start('MenuScene');
  }

  // Generate coloured rectangles when the real PNGs are missing
  buildFallbacks() {
    const g = this.make.graphics({ add: false });
    const missing = (key) => !this.textures.get(key).source[0]?.width ||
                              this.textures.get(key).key === '__MISSING';

    const makeSheet = (key, color, frames, fw = 32, fh = 32) => {
      if (this.textures.exists(key) && !missing(key)) return;
      g.clear();
      g.fillStyle(color);
      for (let i = 0; i < frames; i++) {
        g.fillRect(i * fw, 0, fw - 1, fh - 1);
        // tiny frame number
        g.fillStyle(0x000000, 0.3);
        g.fillRect(i * fw + fw/2 - 2, 2, 4, 4);
        g.fillStyle(color);
      }
      g.generateTexture(key, fw * frames, fh);
    };

    const makeImg = (key, color, w = 32, h = 32) => {
      if (this.textures.exists(key) && !missing(key)) return;
      g.clear();
      g.fillStyle(color);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    makeSheet('player_idle',   0x4488ff, 1);
    makeSheet('player_walk',   0x4488ff, 4);
    makeSheet('player_jump',   0x4488ff, 3);
    makeSheet('player_attack', 0xff8844, 4);
    makeSheet('player_duck',   0x4488ff, 1);
    makeSheet('dummy',         0xcc4444, 2);
    makeSheet('chest',         0xcc9922, 2);
    makeImg  ('ground',        0x228822);
    makeImg  ('platform',      0x886633);

    g.destroy();
  }
}

// ── MenuScene ────────────────────────────────
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    this.add.text(width / 2, height / 2 - 60, 'ELEMENTAL WARS', {
      fontSize: '36px', fontFamily: 'monospace', color: '#ffcc44',
      stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, 'Tutorial Level', {
      fontSize: '18px', fontFamily: 'monospace', color: '#aaccff'
    }).setOrigin(0.5);

    const startBtn = this.add.text(width / 2, height / 2 + 60, '▶  PLAY', {
      fontSize: '22px', fontFamily: 'monospace', color: '#ffffff',
      backgroundColor: '#334466', padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setStyle({ color: '#ffcc44' }));
    startBtn.on('pointerout',  () => startBtn.setStyle({ color: '#ffffff' }));
    startBtn.on('pointerdown', () => this.scene.start('GameScene'));

    this.add.text(width / 2, height - 30,
      'Arrow keys / WASD · ↑/W = jump · ↓/S = duck · E or , = attack', {
      fontSize: '11px', fontFamily: 'monospace', color: '#667799'
    }).setOrigin(0.5);
  }
}

// ── GameScene ────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    // ── World bounds ──────────────────────────────────────────────────
    const WORLD_W = 5000;
    const WORLD_H = this.scale.height;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + 200);

    // ── Sky background ────────────────────────────────────────────────
    this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x87ceeb).setOrigin(0).setScrollFactor(0.1);

    // ── Build level ───────────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    this.buildLevel(WORLD_W, WORLD_H);

    // ── Player ───────────────────────────────────────────────────────
    this.player = this.createPlayer(120, WORLD_H - TS - 64);

    // ── Enemies ──────────────────────────────────────────────────────
    this.dummy = this.createDummy(2800, WORLD_H - TS - 64);

    // ── Chest ────────────────────────────────────────────────────────
    this.chest = this.createChest(4600, WORLD_H - TS - 64);

    // ── Physics overlaps ─────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.platforms);
    this.physics.add.collider(this.dummy.sprite,  this.platforms);
    this.physics.add.collider(this.chest.sprite,  this.platforms);

    // ── Camera ───────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);

    // ── Input ────────────────────────────────────────────────────────
    this.keys = this.input.keyboard.addKeys({
      left:   Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:  Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up:     Phaser.Input.Keyboard.KeyCodes.UP,
      down:   Phaser.Input.Keyboard.KeyCodes.DOWN,
      a:      Phaser.Input.Keyboard.KeyCodes.A,
      d:      Phaser.Input.Keyboard.KeyCodes.D,
      w:      Phaser.Input.Keyboard.KeyCodes.W,
      s:      Phaser.Input.Keyboard.KeyCodes.S,
      e:      Phaser.Input.Keyboard.KeyCodes.E,
      comma:  Phaser.Input.Keyboard.KeyCodes.COMMA,
    });

    // ── Animations ───────────────────────────────────────────────────
    this.buildAnims();

    // ── HUD ──────────────────────────────────────────────────────────
    this.buildHUD();
  }

  // ─────────────────────────────────────────────────────────────────
  //  Level layout
  // ─────────────────────────────────────────────────────────────────
  buildLevel(worldW, worldH) {
    const ground = (x, y, cols) => {
      for (let i = 0; i < cols; i++) {
        const t = this.platforms.create(x + i * TS, y, 'ground');
        t.setScale(SCALE).refreshBody();
      }
    };
    const plat = (x, y, cols) => {
      for (let i = 0; i < cols; i++) {
        const t = this.platforms.create(x + i * TS, y, 'platform');
        t.setScale(SCALE).refreshBody();
      }
    };

    const floorY = worldH - TS / 2;

    // Main floor — almost full world width, with one gap to hop
    ground(0,            floorY, 18);   // start section
    ground(18 * TS + 96, floorY, 12);   // after gap
    ground(35 * TS,      floorY, 18);   // middle
    ground(55 * TS,      floorY, 6);
    ground(62 * TS,      floorY, 100);  // end stretch (chest zone)

    // Floating platforms for variety
    plat(10 * TS, floorY - 3 * TS, 3);
    plat(20 * TS, floorY - 2 * TS, 3);
    plat(28 * TS, floorY - 4 * TS, 3);
    plat(38 * TS, floorY - 3 * TS, 3);
    plat(46 * TS, floorY - 2 * TS, 3);
    plat(55 * TS + 96, floorY - 3 * TS, 3); // bridge over gap

    // Sign post area hints (no text yet)
  }

  // ─────────────────────────────────────────────────────────────────
  //  Player
  // ─────────────────────────────────────────────────────────────────
  createPlayer(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'player_idle')
      .setScale(SCALE)
      .setCollideWorldBounds(true);

    sprite.body.setSize(20, 28).setOffset(6, 4);

    return {
      sprite,
      jumpsLeft:      2,
      isAttacking:    false,
      isDucking:      false,
      attackCooldown: 0,
      hitCooldown:    0,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Training Dummy
  // ─────────────────────────────────────────────────────────────────
  createDummy(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'dummy')
      .setScale(SCALE)
      .setImmovable(true);
    sprite.body.setAllowGravity(false);
    sprite.body.setSize(24, 30).setOffset(4, 2);

    const maxHp = 5;
    return { sprite, hp: maxHp, maxHp, hitFlash: 0, dead: false };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Chest
  // ─────────────────────────────────────────────────────────────────
  createChest(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'chest')
      .setScale(SCALE)
      .setImmovable(true);
    sprite.body.setAllowGravity(false);
    return { sprite, opened: false };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Animations
  // ─────────────────────────────────────────────────────────────────
  buildAnims() {
    const add = (key, sheet, start, end, fps, repeat = -1) => {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key, frameRate: fps, repeat,
          frames: this.anims.generateFrameNumbers(sheet, { start, end })
        });
      }
    };

    add('idle',   'player_idle',   0, 0,  4);
    add('walk',   'player_walk',   0, 3,  8);
    add('jump',   'player_jump',   0, 2,  6, 0);
    add('attack', 'player_attack', 0, 3, 12, 0);
    add('duck',   'player_duck',   0, 0,  4);

    add('dummy_idle', 'dummy', 0, 0, 4);
    add('dummy_hit',  'dummy', 1, 1, 4, 0);

    add('chest_closed', 'chest', 0, 0, 4);
    add('chest_open',   'chest', 1, 1, 4, 0);
  }

  // ─────────────────────────────────────────────────────────────────
  //  HUD
  // ─────────────────────────────────────────────────────────────────
  buildHUD() {
    // Dummy HP bar — drawn in world space, above the dummy
    // We'll update it in update()
    const barBg = this.add.rectangle(0, 0, 80, 10, 0x330000).setOrigin(0.5, 1);
    const barFg = this.add.rectangle(0, 0, 80, 10, 0xff2222).setOrigin(0, 1);
    const barLabel = this.add.text(0, 0, 'Dummy', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffcccc'
    }).setOrigin(0.5, 1);

    this.dummyBar = { bg: barBg, fg: barFg, label: barLabel };

    // Tutorial hints (fixed to camera)
    const { width, height } = this.scale;
    this.hintText = this.add.text(width / 2, 16,
      'Arrow/WASD=move  ↑/W=jump(x2)  ↓/S=duck  E/,=attack', {
      fontSize: '10px', fontFamily: 'monospace',
      color: '#ffffff', backgroundColor: '#00000088',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5, 0).setScrollFactor(0);

    // Victory text (hidden)
    this.victoryText = this.add.text(width / 2, height / 2,
      '🎉 Level Complete!', {
      fontSize: '32px', fontFamily: 'monospace',
      color: '#ffcc44', stroke: '#000', strokeThickness: 6,
      backgroundColor: '#00000099', padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(10);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Main update loop
  // ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.updatePlayer(delta);
    this.updateDummyBar();
    this.updateDummy(delta);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Player controller
  // ─────────────────────────────────────────────────────────────────
  updatePlayer(delta) {
    const p   = this.player;
    const s   = p.sprite;
    const bod = s.body;
    const k   = this.keys;

    const onGround = bod.blocked.down;
    if (onGround) p.jumpsLeft = 2;

    // Cooldowns
    if (p.attackCooldown > 0) p.attackCooldown -= delta;
    if (p.hitCooldown    > 0) p.hitCooldown    -= delta;

    // ── Duck ────────────────────────────────────────────────────────
    const wantDuck = (k.down.isDown || k.s.isDown) && onGround;
    p.isDucking = wantDuck;

    if (p.isAttacking) {
      // Let attack animation finish — no movement override
      if (!s.anims.isPlaying || s.anims.currentAnim?.key !== 'attack') {
        p.isAttacking = false;
      }
      // Still allow horizontal drift during attack
      this.applyHorizontalMove(p, k, 0.6);
      return;
    }

    // ── Attack ──────────────────────────────────────────────────────
    if ((k.e.isDown || k.comma.isDown) && p.attackCooldown <= 0) {
      p.isAttacking    = true;
      p.attackCooldown = 600;
      s.anims.play('attack', true);
      s.once('animationcomplete-attack', () => { p.isAttacking = false; });

      // Hit detection: run on frame 3 of the attack anim (frame index 2)
      this.time.delayedCall(200, () => this.checkAttackHit());
      return;
    }

    // ── Jump ────────────────────────────────────────────────────────
    if ((k.up.isDown || k.w.isDown) && p.jumpsLeft > 0) {
      if (!this._jumpHeld) {
        // Each jump = roughly one player height (96px on screen = 32px / SCALE)
        // Jump vel tuned so apex ≈ TILE*SCALE = 96px above start point
        const jumpVel = -Math.sqrt(2 * Math.abs(this.physics.world.gravity.y) * (TILE * SCALE));
        bod.setVelocityY(jumpVel);
        p.jumpsLeft--;
        s.anims.play('jump', true);
      }
      this._jumpHeld = true;
    } else {
      this._jumpHeld = false;
    }

    // ── Duck animation / movement ────────────────────────────────────
    if (p.isDucking) {
      s.anims.play('duck', true);
      bod.setVelocityX(0);
      return;
    }

    // ── Horizontal movement ─────────────────────────────────────────
    this.applyHorizontalMove(p, k, 1);

    // ── Choose animation ────────────────────────────────────────────
    if (!onGround) {
      if (s.anims.currentAnim?.key !== 'jump') s.anims.play('jump', true);
    } else if (Math.abs(bod.velocity.x) > 10) {
      s.anims.play('walk', true);
    } else {
      s.anims.play('idle', true);
    }
  }

  applyHorizontalMove(p, k, speedMult) {
    const speed = 200 * speedMult;
    const s     = p.sprite;
    if (k.left.isDown || k.a.isDown) {
      s.body.setVelocityX(-speed);
      s.setFlipX(true);
    } else if (k.right.isDown || k.d.isDown) {
      s.body.setVelocityX(speed);
      s.setFlipX(false);
    } else {
      s.body.setVelocityX(0);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Attack hit detection
  // ─────────────────────────────────────────────────────────────────
  checkAttackHit() {
    const p = this.player;
    const ps = p.sprite;

    // ── Dummy ────────────────────────────────────────────────────────
    if (this.dummy && !this.dummy.dead) {
      const ds = this.dummy.sprite;
      const reach = TS * 1.2;
      const dx = Math.abs(ps.x - ds.x);
      const dy = Math.abs(ps.y - ds.y);
      // Must be facing the dummy
      const facing = ps.flipX ? (ds.x < ps.x) : (ds.x > ps.x);

      if (dx < reach && dy < TS && facing) {
        this.hitDummy();
      }
    }

    // ── Chest ─────────────────────────────────────────────────────────
    if (this.chest && !this.chest.opened) {
      const cs = this.chest.sprite;
      const reach = TS * 1.2;
      const dx = Math.abs(ps.x - cs.x);
      const dy = Math.abs(ps.y - cs.y);
      const facing = ps.flipX ? (cs.x < ps.x) : (cs.x > ps.x);

      if (dx < reach && dy < TS && facing) {
        this.openChest();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dummy logic
  // ─────────────────────────────────────────────────────────────────
  hitDummy() {
    const d = this.dummy;
    d.hp = Math.max(0, d.hp - 1);
    d.sprite.anims.play('dummy_hit', true);
    d.sprite.once('animationcomplete-dummy_hit', () => {
      if (!d.dead) d.sprite.anims.play('dummy_idle', true);
    });

    // White flash
    d.sprite.setTint(0xffffff);
    this.time.delayedCall(80, () => {
      if (!d.dead) d.sprite.clearTint();
    });

    if (d.hp <= 0) {
      d.dead = true;
      this.time.delayedCall(150, () => {
        d.sprite.setTint(0x550000);
        // Topple over
        this.tweens.add({
          targets: d.sprite,
          angle: 90,
          alpha: 0,
          duration: 400,
          ease: 'Power2',
          onComplete: () => d.sprite.destroy()
        });
        // Hide HP bar
        this.dummyBar.bg.setVisible(false);
        this.dummyBar.fg.setVisible(false);
        this.dummyBar.label.setVisible(false);
      });
    }
  }

  updateDummy(delta) {
    if (this.dummy.dead) return;
    this.dummy.sprite.anims.play('dummy_idle', true);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dummy HP bar (rendered in world space above the dummy)
  // ─────────────────────────────────────────────────────────────────
  updateDummyBar() {
    if (this.dummy.dead) return;

    const ds   = this.dummy.sprite;
    const bar  = this.dummyBar;
    const barW = 80;
    const bx   = ds.x;
    const by   = ds.y - (TILE * SCALE) / 2 - 8;

    bar.bg.setPosition(bx, by);
    bar.bg.setSize(barW, 10);

    const pct = this.dummy.hp / this.dummy.maxHp;
    bar.fg.setPosition(bx - barW / 2, by);
    bar.fg.setSize(barW * pct, 10);

    bar.label.setPosition(bx, by - 10);
    bar.label.setText(`HP: ${this.dummy.hp} / ${this.dummy.maxHp}`);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Chest
  // ─────────────────────────────────────────────────────────────────
  openChest() {
    const c = this.chest;
    if (c.opened) return;
    c.opened = true;
    c.sprite.anims.play('chest_open', true);
    // Sparkle tween
    this.tweens.add({
      targets: c.sprite,
      scaleX: SCALE * 1.15, scaleY: SCALE * 1.15,
      duration: 120, yoyo: true, repeat: 2
    });
    // Victory after short delay
    this.time.delayedCall(400, () => {
      this.victoryText.setVisible(true);
      this.time.delayedCall(2000, () => this.scene.start('MenuScene'));
    });
  }
}

// ── Boot ─────────────────────────────────────
const config = {
  type:            Phaser.AUTO,
  width:           800,
  height:          480,
  backgroundColor: '#1a1a2e',
  parent:          'game-container',
  pixelArt:        true,
  physics: {
    default: 'arcade',
    arcade:  { gravity: { y: 600 }, debug: false }
  },
  scene: [PreloadScene, MenuScene, GameScene]
};

new Phaser.Game(config);
