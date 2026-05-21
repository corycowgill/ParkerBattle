// Thin wrapper around the Rapier physics world.
//
// Per the design doc's hybrid model, Rapier only handles what it is good at:
// translational movement in the bowl plane, collision detection, and the bounce
// from a clash. Spin / stamina / attack are a separate stat layer (see Stats).
//
// Each bey is a low-friction cylinder with Y-translation and ALL rotation
// locked while it is alive — it is effectively a 2D puck. "Spinning" is a
// stamina number, never conserved angular momentum.

import RAPIER from '@dimforge/rapier3d-compat';

export type Vec3 = { x: number; y: number; z: number };

export interface BeyBodyOptions {
  x: number;
  z: number;
  radius: number;
  halfHeight: number;
  mass: number;
  restitution: number;
}

/** Result of a single collision event, resolved to bey handles. */
export interface ContactEvent {
  handleA: number;
  handleB: number;
  started: boolean;
}

export class Physics {
  readonly world: RAPIER.World;
  private readonly events: RAPIER.EventQueue;
  private static initialised = false;

  /** Must be awaited once before any Physics instance is constructed. */
  static async ready(): Promise<void> {
    if (!Physics.initialised) {
      await RAPIER.init();
      Physics.initialised = true;
    }
  }

  constructor(gravity = 0) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.events = new RAPIER.EventQueue(true);
  }

  /** Step the world by a fixed dt and report collision events. */
  step(dt: number): ContactEvent[] {
    this.world.timestep = dt;
    this.world.step(this.events);

    const contacts: ContactEvent[] = [];
    this.events.drainCollisionEvents((h1, h2, started) => {
      const a = this.world.getCollider(h1);
      const b = this.world.getCollider(h2);
      if (!a || !b) return;
      const bodyA = a.parent();
      const bodyB = b.parent();
      if (!bodyA || !bodyB) return;
      contacts.push({ handleA: bodyA.handle, handleB: bodyB.handle, started });
    });
    return contacts;
  }

  /** Create a bey rigid body — a 2D puck: Y locked, rotation locked. */
  createBeyBody(opts: BeyBodyOptions): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(opts.x, 0, opts.z)
      .enabledTranslations(true, false, true)
      .lockRotations()
      .setLinearDamping(0)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cylinder(opts.halfHeight, opts.radius)
      .setRestitution(opts.restitution)
      .setFriction(0)
      .setMass(opts.mass)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.world.createCollider(colliderDesc, body);

    return body;
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  dispose(): void {
    this.events.free();
    this.world.free();
  }
}

export { RAPIER };
