// ─────────────────────────────────────────────
//  Elemental Wars – Tutorial Level
//  Phaser 3.60  |  32×32 sprite world
// ─────────────────────────────────────────────

const SCALE = 3;           // pixel-art upscale
const TILE  = 32;          // base tile size
const TS    = TILE * SCALE; // 96px on screen

// ── PreloadScene ────────────────────────────
class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    this.load.spritesheet('player_idle',   'assets/idle.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_walk',   'assets/walk.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_jump',   'assets/jump.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_attack', 'assets/attack.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('player_duck',   'assets/duck.png',   { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('dummy',         'assets/dummy.png',  { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('chest',         'assets/chest.png',  { frameWidth: 32, frameHeight: 32 });
    this.load.image('ground',   'assets/ground.png');
    this.load.image('platform', 'assets/platform.png');
  }

  create() {
    // Generate placeholder textures for anything not yet loaded
    this.buildFallbacks();
    this.scene.start('MenuScene');
  }

  // ── Canvas-based fallbacks with proper spritesheet frame data ──────
  buildFallbacks() {
    // Uses native canvas so frame data is correct and Phaser can animate
    const makeSheet = (key, hexColor, numFrames, fw = 32, fh = 32) => {
      if (this.textures.exists(key)) return; // real asset already loaded

      const canvas  = document.createElement('canvas');
      canvas.width  = fw * numFrames;
      canvas.height = fh;
      const ctx = canvas.getContext('2d');

      const r = (hexColor >> 16) & 0xff;
      const g = (hexColor >>  8) & 0xff;
      const b =  hexColor        & 0xff;

      for (let i = 0; i < numFrames; i++) {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(i * fw, 0, fw, fh);
        // thin border so individual frames are visible
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(i * fw + 0.5, 0.5, fw - 1, fh - 1);
      }

      const tex = this.textures.addCanvas(key, canvas);
      // Add numbered frame entries so generateFrameNumbers() works
      for (let i = 0; i < numFrames; i++) {
        tex.add(i, 0, i * fw, 0, fw, fh);
      }
    };

    const makeImg = (key, hexColor, w = 32, h = 32) => {
      if (this.textures.exists(key)) return;

      const canvas  = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const r = (hexColor >> 16) & 0xff;
      const g = (hexColor >>  8) & 0xff;
      const b =  hexColor        & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, w, h);
      this.textures.addCanvas(key, canvas);
    };

    makeSheet('player_idle',   0x4488ff, 1);
    makeSheet('player_walk',   0x4488ff, 4);
    makeSheet('player_jump',   0x44aaff, 3);
    makeSheet('player_attack', 0xff8844, 4);
    makeSheet('player_duck',   0x2266cc, 1);
    makeSheet('dummy',         0xcc4444, 2);
    makeSheet('chest',         0xcc9922, 2);
    makeImg  ('ground',        0x228822);
    makeImg  ('platform',      0x886633);
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
    // pointerup is more reliable than pointerdown for text buttons in Phaser
    startBtn.on('pointerup',   () => this.scene.start('GameScene'));

    // Also allow Enter / Space to start
    const keys = this.input.keyboard.addKeys({
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));

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
    // ── World bounds ─────────────────────────────────────────────────
    const WORLD_W = 5000;
    const WORLD_H = this.scale.height;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + 200);

    // ── Sky (camera background — avoids large rectangle objects) ─────
    this.cameras.main.setBackgroundColor(0x87ceeb);

    // ── Build level ──────────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    this.buildLevel(WORLD_W, WORLD_H);

    // ── Player ──────────────────────────────────────────────────────
    this.player = this.createPlayer(120, WORLD_H - TS - 64);

    // ── Training Dummy ───────────────────────────────────────────────
    this.dummy = this.createDummy(2800, WORLD_H - TS - 64);

    // ── Chest ────────────────────────────────────────────────────────
    this.chest = this.createChest(4600, WORLD_H - TS - 64);

    // ── Physics colliders ────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.platforms);
    this.physics.add.collider(this.dummy.sprite,  this.platforms);
    this.physics.add.collider(this.chest.sprite,  this.platforms);

    // ── Camera ───────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);

    // ── Input ────────────────────────────────────────────────────────
    this.keys = this.input.keyboard.addKeys({
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      e:     Phaser.Input.Keyboard.KeyCodes.E,
      comma: Phaser.Input.Keyboard.KeyCodes.COMMA,
    });

    this._jumpHeld = false;

    // ── Animations ───────────────────────────────────────────────────
    this.buildAnims();

    // Start default animations
    this.player.sprite.anims.play('idle', true);
    this.dummy.sprite.anims.play('dummy_idle', true);
    this.chest.sprite.anims.play('chest_closed', true);

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

    // Main floor with one gap players must jump or platform over
    ground(0,            floorY, 18);
    ground(18 * TS + 96, floorY, 12);
    ground(35 * TS,      floorY, 18);
    ground(55 * TS,      floorY, 6);
    ground(62 * TS,      floorY, 100); // end stretch — dummy + chest zone

    // Floating platforms
    plat(10 * TS,       floorY - 3 * TS, 3);
    plat(20 * TS,       floorY - 2 * TS, 3);
    plat(28 * TS,       floorY - 4 * TS, 3);
    plat(38 * TS,       floorY - 3 * TS, 3);
    plat(46 * TS,       floorY - 2 * TS, 3);
    plat(55 * TS + 96,  floorY - 3 * TS, 3); // bridge over gap
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
    return { sprite, hp: maxHp, maxHp, dead: false };
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
  //  HUD
  // ─────────────────────────────────────────────────────────────────
  buildHUD() {
    // HP bar — positioned in world space above the dummy each frame
    const barBg    = this.add.rectangle(0, 0, 80, 10, 0x330000).setOrigin(0.5, 1);
    const barFg    = this.add.rectangle(0, 0, 80, 10, 0xff2222).setOrigin(0,   1);
    const barLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffcccc'
    }).setOrigin(0.5, 1);

    this.dummyBar = { bg: barBg, fg: barFg, label: barLabel };

    // Camera-fixed hint strip
    const { width, height } = this.scale;
    this.add.text(width / 2, 16,
      'Arrow/WASD = move   ↑/W = jump (x2)   ↓/S = duck   E or , = attack', {
      fontSize: '10px', fontFamily: 'monospace',
      color: '#ffffff', backgroundColor: '#00000099',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5, 0).setScrollFactor(0);

    // Victory banner (hidden until chest opened)
    this.victoryText = this.add.text(width / 2, height / 2, '  Level Complete!  ', {
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

    if (p.attackCooldown > 0) p.attackCooldown -= delta;

    // ── Attacking — let the anim finish, allow light movement ───────
    if (p.isAttacking) {
      this.applyHorizontalMove(p, k, 0.6);
      return;
    }

    // ── Attack trigger ───────────────────────────────────────────────
    if ((k.e.isDown || k.comma.isDown) && p.attackCooldown <= 0) {
      p.isAttacking    = true;
      p.attackCooldown = 600;
      s.anims.play('attack', true);
      s.once('animationcomplete-attack', () => { p.isAttacking = false; });
      // Hit detection fires mid-swing
      this.time.delayedCall(200, () => this.checkAttackHit());
      return;
    }

    // ── Jump (each apex ≈ one player height) ────────────────────────
    const jumpPressed = k.up.isDown || k.w.isDown;
    if (jumpPressed && !this._jumpHeld && p.jumpsLeft > 0) {
      const jumpVel = -Math.sqrt(2 * Math.abs(this.physics.world.gravity.y) * TS);
      bod.setVelocityY(jumpVel);
      p.jumpsLeft--;
      s.anims.play('jump', true);
    }
    this._jumpHeld = jumpPressed;

    // ── Duck ────────────────────────────────────────────────────────
    if ((k.down.isDown || k.s.isDown) && onGround) {
      s.anims.play('duck', true);
      bod.setVelocityX(0);
      return;
    }

    // ── Horizontal movement ─────────────────────────────────────────
    this.applyHorizontalMove(p, k, 1);

    // ── Animation ───────────────────────────────────────────────────
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
    const ps    = this.player.sprite;
    const reach = TS * 1.2;

    // ── Dummy ────────────────────────────────────────────────────────
    if (this.dummy && !this.dummy.dead) {
      const ds     = this.dummy.sprite;
      const dx     = Math.abs(ps.x - ds.x);
      const dy     = Math.abs(ps.y - ds.y);
      const facing = ps.flipX ? (ds.x < ps.x) : (ds.x > ps.x);
      if (dx < reach && dy < TS && facing) this.hitDummy();
    }

    // ── Chest ─────────────────────────────────────────────────────────
    if (this.chest && !this.chest.opened) {
      const cs     = this.chest.sprite;
      const dx     = Math.abs(ps.x - cs.x);
      const dy     = Math.abs(ps.y - cs.y);
      const facing = ps.flipX ? (cs.x < ps.x) : (cs.x > ps.x);
      if (dx < reach && dy < TS && facing) this.openChest();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dummy logic
  // ─────────────────────────────────────────────────────────────────
  hitDummy() {
    const d = this.dummy;
    d.hp = Math.max(0, d.hp - 1);

    if (d.hp <= 0) {
      // ── Killing blow — topple, no flash ───────────────────────────
      d.dead = true;
      d.sprite.anims.play('dummy_hit', true);
      this.time.delayedCall(150, () => {
        d.sprite.setTint(0x550000);
        this.tweens.add({
          targets:  d.sprite,
          angle:    90,
          alpha:    0,
          duration: 400,
          ease:     'Power2',
          onComplete: () => d.sprite.destroy()
        });
        this.dummyBar.bg.setVisible(false);
        this.dummyBar.fg.setVisible(false);
        this.dummyBar.label.setVisible(false);
      });
    } else {
      // ── Non-lethal hit — white flash, then back to idle ───────────
      d.sprite.anims.play('dummy_hit', true);

      // setTintFill makes it solid white (visible flash)
      d.sprite.setTintFill(0xffffff);
      this.time.delayedCall(100, () => {
        if (!d.dead) {
          d.sprite.clearTint();
          d.sprite.anims.play('dummy_idle', true);
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dummy HP bar (world-space, above the dummy)
  // ─────────────────────────────────────────────────────────────────
  updateDummyBar() {
    if (this.dummy.dead) return;

    const ds   = this.dummy.sprite;
    const bar  = this.dummyBar;
    const barW = 80;
    const bx   = ds.x;
    const by   = ds.y - TS / 2 - 8;

    bar.bg.setPosition(bx, by).setSize(barW, 10);

    const pct = this.dummy.hp / this.dummy.maxHp;
    bar.fg.setPosition(bx - barW / 2, by).setSize(barW * pct, 10);

    bar.label.setPosition(bx, by - 10)
             .setText(`HP: ${this.dummy.hp} / ${this.dummy.maxHp}`);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Chest
  // ─────────────────────────────────────────────────────────────────
  openChest() {
    const c = this.chest;
    if (c.opened) return;
    c.opened = true;
    c.sprite.anims.play('chest_open', true);

    this.tweens.add({
      targets:  c.sprite,
      scaleX:   SCALE * 1.15,
      scaleY:   SCALE * 1.15,
      duration: 120,
      yoyo:     true,
      repeat:   2
    });

    this.time.delayedCall(400, () => {
      this.victoryText.setVisible(true);
      this.time.delayedCall(2500, () => this.scene.start('MenuScene'));
    });
  }
}

// ── Boot ─────────────────────────────────────
const config = {
  type:            Phaser.AUTO,
  width:           800,
  height:          480,
  parent:          'game-container',
  pixelArt:        true,
  physics: {
    default: 'arcade',
    arcade:  { gravity: { y: 600 }, debug: false }
  },
  scene: [PreloadScene, MenuScene, GameScene]
};

new Phaser.Game(config);
