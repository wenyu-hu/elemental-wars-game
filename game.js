// ─────────────────────────────────────────────
//  Elemental Wars – Tutorial Level
//  Phaser 3.60  |  32×32 sprite world
// ─────────────────────────────────────────────

const SCALE = 3;            // pixel-art upscale
const TILE  = 32;           // base tile size
const TS    = TILE * SCALE; // 96px on screen

// ── PreloadScene ────────────────────────────
class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }

  preload() {
    // Frame sizes match the cropped assets (transparent padding removed)
    this.load.spritesheet('player_idle',   'assets/idle.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_walk',   'assets/walk.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_jump',   'assets/jump.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_attack', 'assets/attack.png', { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('player_duck',   'assets/duck.png',   { frameWidth: 18, frameHeight: 31 });
    this.load.spritesheet('dummy',         'assets/dummy.png',  { frameWidth: 27, frameHeight: 25 });
    this.load.spritesheet('chest',         'assets/chest.png',  { frameWidth: 14, frameHeight: 16 });
    this.load.image('ground',   'assets/ground.png');
    this.load.image('platform', 'assets/platform.png');
  }

  create() {
    this.buildFallbacks();
    this.scene.start('MenuScene');
  }

  buildFallbacks() {
    const makeSheet = (key, hexColor, numFrames, fw = 32, fh = 32) => {
      if (this.textures.exists(key)) return;
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
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(i * fw + 0.5, 0.5, fw - 1, fh - 1);
      }
      const tex = this.textures.addCanvas(key, canvas);
      for (let i = 0; i < numFrames; i++) tex.add(i, 0, i * fw, 0, fw, fh);
    };

    const makeImg = (key, hexColor, w = 32, h = 32) => {
      if (this.textures.exists(key)) return;
      const canvas  = document.createElement('canvas');
      canvas.width  = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const r = (hexColor >> 16) & 0xff;
      const g = (hexColor >>  8) & 0xff;
      const b =  hexColor        & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, w, h);
      this.textures.addCanvas(key, canvas);
    };

    makeSheet('player_idle',   0x4488ff, 1, 18, 31);
    makeSheet('player_walk',   0x4488ff, 4, 18, 31);
    makeSheet('player_jump',   0x44aaff, 3, 18, 31);
    makeSheet('player_attack', 0xff8844, 4, 18, 31);
    makeSheet('player_duck',   0x2266cc, 1, 18, 31);
    makeSheet('dummy',         0xcc4444, 2, 27, 25);
    makeSheet('chest',         0xcc9922, 2, 14, 16);
    makeImg  ('ground',        0x4a9944, 32, 32);
    makeImg  ('platform',      0x8b5e3c, 32,  6);
  }
}

// ── MenuScene ────────────────────────────────
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;

    // ── Dadish-style background: bright, airy, clean ─────────────────
    this.add.rectangle(0, 0, width, height, 0xeef8ff).setOrigin(0);

    // Clouds
    const cg = this.add.graphics();
    cg.fillStyle(0xffffff, 0.9);
    [[90, 75, 130, 44], [280, 52, 100, 36], [500, 85, 150, 48],
     [680, 58, 110, 38], [760, 110, 90, 32]].forEach(([x, y, w, h]) => {
      cg.fillEllipse(x, y, w, h);
      cg.fillEllipse(x - w * 0.22, y - h * 0.28, w * 0.55, h * 0.65);
      cg.fillEllipse(x + w * 0.18, y - h * 0.22, w * 0.50, h * 0.60);
    });

    // Ground strip
    this.add.rectangle(0, height - 54, width, 54, 0x6dbf67).setOrigin(0);
    this.add.rectangle(0, height - 54, width,  9, 0x52a84f).setOrigin(0);

    // ── Title ─────────────────────────────────────────────────────────
    this.add.text(width / 2, height / 2 - 90, 'ELEMENTAL WARS', {
      fontSize: '42px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ff5722', stroke: '#ffffff', strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 38, 'Tutorial Level', {
      fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#2d6a4f'
    }).setOrigin(0.5);

    // ── Play button ───────────────────────────────────────────────────
    const btn = this.add.text(width / 2, height / 2 + 28, '  PLAY  ', {
      fontSize: '26px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ffffff', backgroundColor: '#ff5722', padding: { x: 28, y: 13 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#e64a19' }));
    btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#ff5722' }));
    btn.on('pointerup',   () => this.scene.start('GameScene'));

    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));

    // ── Controls hint ─────────────────────────────────────────────────
    this.add.text(width / 2, height - 24,
      'Arrow keys / WASD  ·  ↑/W = jump (×2)  ·  ↓/S = duck  ·  E or , = attack', {
      fontSize: '11px', fontFamily: 'monospace', color: '#2d6a4f'
    }).setOrigin(0.5);
  }
}

// ── GameScene ────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    const WORLD_W = 3600;
    const WORLD_H = this.scale.height;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + 200);

    // ── Background (drawn before physics objects, low depth) ─────────
    this.cameras.main.setBackgroundColor(0xeef8ff);
    this.addBackground(WORLD_W, WORLD_H);

    // ── Level ────────────────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    this.buildLevel(WORLD_W, WORLD_H);

    // ── Entities ─────────────────────────────────────────────────────
    this.player = this.createPlayer(120, WORLD_H - TS - 80);
    this.dummy  = this.createDummy(1800, WORLD_H - TS - 60);
    this.chest  = this.createChest(3000, WORLD_H - TS - 60);

    // ── Colliders ────────────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.platforms);
    this.physics.add.collider(this.dummy.sprite,  this.platforms);
    this.physics.add.collider(this.chest.sprite,  this.platforms);

    // ── Camera — zoomed out for that Dadish feel ──────────────────────
    this.cameras.main.setZoom(0.65);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);

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

    // ── Animations & HUD ─────────────────────────────────────────────
    this.buildAnims();
    this.player.sprite.anims.play('idle', true);
    this.dummy.sprite.anims.play('dummy_idle', true);
    this.chest.sprite.anims.play('chest_closed', true);
    this.buildHUD();
  }

  // ─────────────────────────────────────────────────────────────────
  //  Parallax background — clouds, hills, sky bands
  // ─────────────────────────────────────────────────────────────────
  addBackground(worldW, worldH) {
    // Far sky wash (very slow parallax)
    this.add.rectangle(0, 0, worldW, worldH, 0xdcf2ff)
      .setOrigin(0).setScrollFactor(0.03).setDepth(-10);

    // Distant hills
    const hills = this.add.graphics().setScrollFactor(0.08).setDepth(-9);
    hills.fillStyle(0xa8d8a8);
    for (let i = 0; i < 12; i++) {
      const hx = i * 380 + 180;
      const hw = 340 + (i % 3) * 70;
      const hh = 110 + (i % 4) * 22;
      hills.fillEllipse(hx, worldH - 44, hw, hh);
    }

    // White clouds (mid parallax)
    const clouds = this.add.graphics().setScrollFactor(0.18).setDepth(-8);
    clouds.fillStyle(0xffffff, 0.92);
    [
      [230, 65, 140, 48], [600, 48, 108, 38], [960, 82, 165, 54],
      [1340, 58, 125, 44], [1720, 88, 150, 52], [2100, 55, 115, 40],
      [2470, 76, 158, 50], [2850, 68, 128, 45], [3200, 84, 145, 50],
    ].forEach(([cx, cy, cw, ch]) => {
      clouds.fillEllipse(cx,              cy,           cw,        ch);
      clouds.fillEllipse(cx - cw * 0.22, cy - ch * 0.28, cw * 0.55, ch * 0.65);
      clouds.fillEllipse(cx + cw * 0.18, cy - ch * 0.22, cw * 0.50, ch * 0.60);
    });
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
    const plat = (x, y) => {
      const t = this.platforms.create(x, y, 'platform');
      t.setScale(SCALE).refreshBody();
    };

    const floorY = worldH - TS / 2;

    // Floor: mostly continuous, one small 1-tile gap to hop
    ground(0,        floorY, 16);   // 0–1536
    ground(17 * TS,  floorY, 22);   // 1632–3744

    // Floating platforms — all reachable with 1–2 jumps from the floor
    plat(6  * TS, floorY - 1 * TS);   // ~96px above floor  (single jump)
    plat(12 * TS, floorY - 2 * TS);   // ~192px above floor (double jump)
    plat(19 * TS, floorY - 1 * TS);
    plat(26 * TS, floorY - 2 * TS);
    plat(33 * TS, floorY - 1 * TS);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Player
  // ─────────────────────────────────────────────────────────────────
  createPlayer(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'player_idle')
      .setScale(SCALE)
      .setCollideWorldBounds(true)
      .setFlipX(true);  // start facing right

    sprite.body.setSize(14, 27).setOffset(2, 2);

    return { sprite, jumpsLeft: 2, isAttacking: false, attackCooldown: 0 };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Training Dummy
  // ─────────────────────────────────────────────────────────────────
  createDummy(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'dummy')
      .setScale(SCALE).setImmovable(true);
    sprite.body.setAllowGravity(false);
    sprite.body.setSize(23, 23).setOffset(2, 1);
    const maxHp = 5;
    return { sprite, hp: maxHp, maxHp, dead: false };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Chest
  // ─────────────────────────────────────────────────────────────────
  createChest(x, y) {
    const sprite = this.physics.add.sprite(x, y, 'chest')
      .setScale(SCALE).setImmovable(true);
    sprite.body.setAllowGravity(false);
    sprite.body.setSize(12, 14).setOffset(1, 1);
    return { sprite, opened: false };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Animations
  // ─────────────────────────────────────────────────────────────────
  buildAnims() {
    const add = (key, sheet, start, end, fps, repeat = -1) => {
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frameRate: fps, repeat,
          frames: this.anims.generateFrameNumbers(sheet, { start, end }) });
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
    // Dummy HP bar — world-space, repositioned every frame
    const barBg    = this.add.rectangle(0, 0, 80, 10, 0x220000).setOrigin(0.5, 1);
    const barFg    = this.add.rectangle(0, 0, 80, 10, 0xff3333).setOrigin(0,   1);
    const barLabel = this.add.text(0, 0, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffbbbb'
    }).setOrigin(0.5, 1);
    this.dummyBar = { bg: barBg, fg: barFg, label: barLabel };

    // Controls strip — fixed to camera (setScrollFactor(0) is unaffected by zoom)
    const { width, height } = this.scale;
    this.add.text(width / 2, 18,
      'Arrow/WASD = move   ↑/W = jump (×2)   ↓/S = duck   E or , = attack', {
      fontSize: '11px', fontFamily: 'monospace',
      color: '#1a3a5c', backgroundColor: '#ffffffcc',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5, 0).setScrollFactor(0);

    // Victory banner
    this.victoryText = this.add.text(width / 2, height / 2, '  Level Complete!  ', {
      fontSize: '36px', fontFamily: '"Arial Black", Arial, sans-serif',
      color: '#ff5722', stroke: '#ffffff', strokeThickness: 6,
      backgroundColor: '#ffffffcc', padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(10);
  }

  // ─────────────────────────────────────────────────────────────────
  //  Update
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

    if (p.isAttacking) {
      this.applyHorizontalMove(p, k, 0.6);
      return;
    }

    // Attack
    if ((k.e.isDown || k.comma.isDown) && p.attackCooldown <= 0) {
      p.isAttacking    = true;
      p.attackCooldown = 600;
      s.anims.play('attack', true);
      s.once('animationcomplete-attack', () => { p.isAttacking = false; });
      this.time.delayedCall(200, () => this.checkAttackHit());
      return;
    }

    // Jump
    const jumpPressed = k.up.isDown || k.w.isDown;
    if (jumpPressed && !this._jumpHeld && p.jumpsLeft > 0) {
      bod.setVelocityY(-Math.sqrt(2 * Math.abs(this.physics.world.gravity.y) * TS));
      p.jumpsLeft--;
      s.anims.play('jump', true);
    }
    this._jumpHeld = jumpPressed;

    // Duck
    if ((k.down.isDown || k.s.isDown) && onGround) {
      s.anims.play('duck', true);
      bod.setVelocityX(0);
      return;
    }

    this.applyHorizontalMove(p, k, 1);

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
      s.setFlipX(false);   // sprite naturally faces left
    } else if (k.right.isDown || k.d.isDown) {
      s.body.setVelocityX(speed);
      s.setFlipX(true);    // flipped = faces right
    } else {
      s.body.setVelocityX(0);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Attack hit detection
  // ─────────────────────────────────────────────────────────────────
  checkAttackHit() {
    const ps    = this.player.sprite;
    const reach = TS * 1.3;

    if (this.dummy && !this.dummy.dead) {
      const ds     = this.dummy.sprite;
      const dx     = Math.abs(ps.x - ds.x);
      const dy     = Math.abs(ps.y - ds.y);
      const facing = ps.flipX ? (ds.x > ps.x) : (ds.x < ps.x);
      if (dx < reach && dy < TS && facing) this.hitDummy();
    }

    if (this.chest && !this.chest.opened) {
      const cs     = this.chest.sprite;
      const dx     = Math.abs(ps.x - cs.x);
      const dy     = Math.abs(ps.y - cs.y);
      const facing = ps.flipX ? (cs.x > ps.x) : (cs.x < ps.x);
      if (dx < reach && dy < TS && facing) this.openChest();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Dummy
  // ─────────────────────────────────────────────────────────────────
  hitDummy() {
    const d = this.dummy;
    d.hp = Math.max(0, d.hp - 1);

    if (d.hp <= 0) {
      d.dead = true;
      d.sprite.anims.play('dummy_hit', true);
      this.time.delayedCall(150, () => {
        d.sprite.setTint(0x550000);
        this.tweens.add({
          targets: d.sprite, angle: 90, alpha: 0, duration: 400, ease: 'Power2',
          onComplete: () => d.sprite.destroy()
        });
        this.dummyBar.bg.setVisible(false);
        this.dummyBar.fg.setVisible(false);
        this.dummyBar.label.setVisible(false);
      });
    } else {
      d.sprite.anims.play('dummy_hit', true);
      d.sprite.setTintFill(0xffffff);
      this.time.delayedCall(100, () => {
        if (!d.dead) {
          d.sprite.clearTint();
          d.sprite.anims.play('dummy_idle', true);
        }
      });
    }
  }

  updateDummyBar() {
    if (this.dummy.dead) return;
    const ds  = this.dummy.sprite;
    const bar = this.dummyBar;
    const barW = 80;
    const bx  = ds.x;
    const by  = ds.y - 25 * SCALE / 2 - 8;

    bar.bg.setPosition(bx, by).setSize(barW, 10);
    const pct = this.dummy.hp / this.dummy.maxHp;
    bar.fg.setPosition(bx - barW / 2, by).setSize(barW * pct, 10);
    bar.label.setPosition(bx, by - 10).setText(`HP: ${this.dummy.hp} / ${this.dummy.maxHp}`);
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
      targets: c.sprite, scaleX: SCALE * 1.2, scaleY: SCALE * 1.2,
      duration: 120, yoyo: true, repeat: 2
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
