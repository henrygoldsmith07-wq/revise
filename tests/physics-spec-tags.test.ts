import { describe, expect, it } from "vitest";
import { authenticExpansionQuestions, seedQuestions } from "@/content";
import type { Question } from "@/domain/types";
import { TAUGHT_SPEC_POINT_IDS } from "@/content/teaching/taught-spec-points";
import { topicsFor } from "@/domain/curriculum";

// Thirtieth pass. A lost mark links to /lesson?…&checkpoint=<the part's spec
// point>, so a wrong tag sends the student to the wrong lesson. The 24 WJEC
// Physics items in massive-authentic.ts were audited one by one against the
// curriculum statement and the authored teaching for each point; 15 were
// retagged (see CHANGELOG, thirtieth pass). This pins the audited mapping, so
// a later edit to a `point` argument has to change this table on purpose.
// The same items also feed aqa-alevel-physics, whose topic tree is a clone of
// the WJEC one (same ids per topic), so one number is right for both.

const PHYSICS = "wjec-alevel-physics";
const AUDITED: Record<string, string> = {
  "physics-projectile-components": "kinematics-dynamics.sp-06", // 1.2(a) projectile motion (was sp-02, motion graphs)
  "physics-terminal-speed": "kinematics-dynamics.sp-07", // 1.3(a) drag and terminal velocity (was sp-01, scalars/vectors)
  "physics-efficiency": "energy-power.sp-03", // 1.4(c) power and efficiency (was sp-01, work done)
  "physics-stress-strain": "materials.sp-01", // 1.5(a) Young modulus (was sp-02, Hooke's law)
  "physics-standing-wave": "waves.sp-03", // 2.1(c) stationary waves (was sp-02, Young slits)
  "physics-photoelectric-work-function": "quantum.sp-01", // 2.5(a) photoelectric equation (was sp-02, threshold frequency)
  "physics-electric-resistivity": "electric-circuits.sp-02", // unchanged; left for teacher review (resistivity is taught under sp-01)
  "physics-internal-resistance": "electric-circuits.sp-02", // 2.4(b) numerical; internal resistance taught there (was sp-01, recall)
  "physics-momentum-explosion": "momentum.sp-02", // 3.1(b) conservation in explosions (was sp-01, definitions)
  "physics-shm-condition": "circular-shm.sp-03", // unchanged
  "physics-resonance-damping": "circular-shm.sp-07", // 3.2(g) damping and resonance (was sp-02, centripetal acceleration)
  "physics-orbital-speed": "fields.sp-04", // unchanged
  "physics-induced-emf": "fields.sp-08", // 3.6(b) induced emf from flux linkage (was sp-02, field strength)
  "physics-ideal-gas": "thermal.sp-03", // 4.1(c) pV = nRT (was sp-01, internal energy)
  "physics-specific-heat": "thermal.sp-02", // unchanged
  "physics-radioactive-half-life": "nuclear.sp-03", // 4.4(a) activity and half-life (was sp-02, nuclear radius)
  "physics-binding-energy": "nuclear.sp-04", // unchanged; second half arguably sp-05, left for teacher review
  "physics-particle-conservation": "nuclear.sp-07", // 4.5(b) beta-minus decay (was sp-02, nuclear radius)
  "physics-polarisation": "waves.sp-05", // 2.2(a) polarisation shows light is transverse (was sp-03, stationary waves)
  "physics-de-broglie": "quantum.sp-04", // 2.5(d) λ = h/p from m and v (was sp-01, photon energy)
  "more-alevel-physics-filament-lamp": "electric-circuits.sp-05", // unchanged
  "more-alevel-physics-critical-angle": "waves.sp-04", // unchanged
  "more-alevel-physics-field-potential": "fields.sp-03", // unchanged
  "more-alevel-physics-kinetic-energy": "thermal.sp-05", // unchanged
};

describe("Physics spec-point tags", () => {
  const known = new Map(topicsFor(PHYSICS).flatMap((t) => (t.specPoints ?? []).map((s) => [s.id, t.id] as const)));

  it("every WJEC Physics tag in the bank is a real curriculum point in the question's own topic", () => {
    const problems: string[] = [];
    for (const q of seedQuestions.filter((x) => x.subjectId === PHYSICS)) {
      for (const id of [...(q.specPointIds ?? []), ...q.parts.flatMap((p) => p.specPointIds ?? [])]) {
        const topic = known.get(id);
        if (!topic) problems.push(`${q.id}: ${id} is not in the curriculum`);
        else if (!q.topicIds.includes(topic)) problems.push(`${q.id}: ${id} belongs to ${topic}, not ${q.topicIds.join(",")}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("massive-authentic Physics items keep their audited tags, each a taught checkpoint", () => {
    for (const subjectId of [PHYSICS, "aqa-alevel-physics"]) {
      const items = authenticExpansionQuestions.filter((q) => q.subjectId === subjectId);
      expect(items).toHaveLength(Object.keys(AUDITED).length);
      for (const q of items) {
        const slug = q.id.replace(`cnt:question:authentic-expansion-${subjectId}-`, "");
        expect(AUDITED[slug], `${q.id} is not in the audited table`).toBeDefined();
        expect(q.parts.flatMap((p) => p.specPointIds ?? []), q.id).toEqual([`${subjectId}.${AUDITED[slug]}`]);
      }
    }
    for (const tag of Object.values(AUDITED)) expect(TAUGHT_SPEC_POINT_IDS.includes(`${PHYSICS}.${tag}`), tag).toBe(true);
  });
});

// Thirty-first pass. data-expansion, unfamiliar-context and authentic-source
// tagged every item sp-01 of its topic, and evidence-expansion defaulted to
// sp-01 too, whatever the question tested (the same bug massive-authentic had).
// scripts/audit-physics-spec-tags.mjs ranked them; each retag below was then
// checked by hand against the curriculum statement. The same items feed every
// Physics variant, whose topic trees carry the same 76 core points, so the
// tags are pinned for all of them. Key: question id after "cnt:question:"
// with the subject replaced by {s}, then ":part-index".
const RETAGGED_31: Record<string, string> = {
  "data-expansion-{s}-velocity-time-table:0": "kinematics-dynamics.sp-02", // acceleration as the gradient of v-t data (was sp-01, scalars/vectors)
  "data-expansion-{s}-power-efficiency-data:0": "energy-power.sp-03", // efficiency of a lift (was sp-01, work done)
  "data-expansion-{s}-iv-data:0": "electric-circuits.sp-05", // is the component ohmic, from I-V data (was sp-01, recall definitions)
  "data-expansion-{s}-collision-data:0": "momentum.sp-02", // common velocity by conservation; 2 of 3 marks (was sp-01, definitions)
  "data-expansion-{s}-gas-pressure-data:0": "thermal.sp-03", // p ∝ T at constant volume (was sp-01, internal energy)
  "data-expansion-{s}-half-life-count-data:0": "nuclear.sp-03", // half-life from background-corrected counts (was sp-01, Rutherford scattering)
  "unfamiliar-context-{s}-hovercraft-launch:0": "kinematics-dynamics.sp-04", // driving force from F = ma (was sp-01)
  "unfamiliar-context-{s}-wave-buoy:0": "energy-power.sp-03", // useful power with efficiency (was sp-01)
  "unfamiliar-context-{s}-airbag-collision:0": "momentum.sp-04", // average force = Δp/Δt (was sp-01, definitions)
  "unfamiliar-context-{s}-space-station-rotation:0": "circular-shm.sp-02", // centripetal acceleration ω²r (was sp-01, angular velocity)
  "unfamiliar-context-{s}-lunar-transfer:0": "fields.sp-03", // change in gravitational potential (was sp-01, Newton/Coulomb laws)
  "unfamiliar-context-{s}-medical-tracer:0": "nuclear.sp-03", // activity after three half-lives (was sp-01, Rutherford scattering)
  "authentic-source-{s}-cyclist-field-note:0": "kinematics-dynamics.sp-04", // driving force from F = ma (was sp-01)
  "authentic-source-{s}-tidal-generator-report:0": "energy-power.sp-03", // chained efficiencies (was sp-01, work done)
  "authentic-source-{s}-photodiode-brief:0": "quantum.sp-02", // no emission below threshold whatever the intensity (was sp-01)
  "authentic-source-{s}-crash-test-report:0": "momentum.sp-04", // minimum time from Δp/F (was sp-01, definitions)
  "authentic-source-{s}-centrifuge-log:0": "circular-shm.sp-02", // ω from a = ω²r (was sp-01, angular velocity)
  "authentic-source-{s}-planetary-mission-report:0": "fields.sp-04", // inverse-square g at 2R and 4R (was sp-01)
  "authentic-source-{s}-radiotherapy-record:0": "nuclear.sp-03", // time for activity to fall to 60 MBq (was sp-01)
  "evidence-{s}-satellite-orbit-synoptic:0": "fields.sp-04", // orbital speed v = √(GM/r) (was sp-01)
  "evidence-{s}-satellite-orbit-synoptic:1": "fields.sp-04", // energy needed to raise an orbit (was sp-01)
  "evidence-{s}-third-law-misconception:0": "kinematics-dynamics.sp-04", // Newton's third law pairs (was sp-01, scalars/vectors)
  "evidence-{s}-projectile-data-interpretation:0": "kinematics-dynamics.sp-06", // projectile time of flight (was sp-01)
  "evidence-{s}-projectile-data-interpretation:1": "kinematics-dynamics.sp-06", // projectile range (was sp-01)
  "evidence-{s}-projectile-data-interpretation:2": "kinematics-dynamics.sp-06", // constant horizontal velocity (was sp-01)
  "phys-circular-banked:0": "circular-shm.sp-02", // centripetal force on a car (was sp-04, SHM); seen in the 360px walkthrough
};
// Ranked as suspects, but no single better point was clear: left for teacher
// review with their old tag. Pinned so a change is deliberate.
const LEFT_FOR_REVIEW_31: Record<string, string> = {
  "data-expansion-{s}-shm-period-data:0": "circular-shm.sp-01", // SHM from constant period: sp-03, sp-04 or sp-05?
  "data-expansion-{s}-gravitational-potential-data:0": "fields.sp-01", // V ∝ 1/r: sp-03 or sp-04? sp-01 is wrong
  "unfamiliar-context-{s}-wearable-sensor:0": "electric-circuits.sp-01", // qualitative potential divider: sp-01, sp-02 or sp-03?
  "unfamiliar-context-{s}-insulated-cup:0": "thermal.sp-01", // conduction/convection/radiation: no WJEC thermal point fits
  "authentic-source-{s}-sensor-circuit-note:0": "electric-circuits.sp-01", // as wearable-sensor
  "authentic-source-{s}-thermal-storage-log:0": "thermal.sp-01", // vacuum flask: no WJEC thermal point fits
  "evidence-{s}-centripetal-practical-evaluate:0": "circular-shm.sp-01", // practical method: sp-01 or sp-02?
  "evidence-{s}-centripetal-practical-evaluate:1": "circular-shm.sp-01",
};

describe("Physics spec-point tags (thirty-first pass)", () => {
  const PHYSICS_VARIANTS = [...new Set(seedQuestions.filter((q) => q.subjectId.endsWith("-physics")).map((q) => q.subjectId))];
  const byId = new Map<string, Question>(seedQuestions.map((q) => [q.id, q]));

  function check(table: Record<string, string>) {
    let checked = 0;
    for (const [key, tag] of Object.entries(table)) {
      const [slug, index] = key.split(":");
      const subjects = slug.includes("{s}") ? PHYSICS_VARIANTS : [PHYSICS];
      for (const subjectId of subjects) {
        const id = `cnt:question:${slug.replace("{s}", subjectId)}`;
        const q = byId.get(id);
        if (!q && slug.includes("{s}")) continue; // not every variant carries every builder
        expect(q, id).toBeDefined();
        expect(q!.parts[Number(index)].specPointIds, `${id} part ${index}`).toEqual([`${subjectId}.${tag}`]);
        checked++;
      }
    }
    return checked;
  }

  it("the retagged items carry their audited point, in every Physics variant", () => {
    expect(check(RETAGGED_31)).toBeGreaterThanOrEqual(Object.keys(RETAGGED_31).length);
    for (const tag of Object.values(RETAGGED_31)) expect(TAUGHT_SPEC_POINT_IDS.includes(`${PHYSICS}.${tag}`), tag).toBe(true);
  });

  it("items left for teacher review keep their old tag until someone decides", () => {
    expect(check(LEFT_FOR_REVIEW_31)).toBeGreaterThanOrEqual(Object.keys(LEFT_FOR_REVIEW_31).length);
  });

  it("every Physics variant's tags are real points in the question's own topic", () => {
    const problems: string[] = [];
    for (const subjectId of PHYSICS_VARIANTS) {
      const known = new Map(topicsFor(subjectId).flatMap((t) => (t.specPoints ?? []).map((s) => [s.id, t.id] as const)));
      if (!known.size) continue;
      for (const q of seedQuestions.filter((x) => x.subjectId === subjectId)) {
        for (const id of q.parts.flatMap((p) => p.specPointIds ?? [])) {
          const topic = known.get(id);
          if (!topic) problems.push(`${q.id}: ${id} is not in the curriculum`);
          else if (!q.topicIds.includes(topic)) problems.push(`${q.id}: ${id} belongs to ${topic}`);
        }
      }
    }
    // Found by this check, outside this pass's scope (AQA GCSE): the topic tree
    // stops at sp-07. Left for its owner; listed so a new problem still fails.
    expect(problems).toEqual(["cnt:question:aqa-gcse-physics-practical-resistance: aqa-gcse-physics.electric-circuits.sp-08 is not in the curriculum"]);
  });
});

// Sixty-third pass. The tag audit's top suspects in physics-extra.ts (and its AQA
// clone) pointed a lost mark at the wrong lesson: binding energy went to the
// activity/half-life lesson, impulse force to the impulse-in-collisions lesson,
// specific heat to internal energy, and pV = nRT to the kinetic theory lesson.
// Each was checked against the curriculum statement and matches the mapping the
// thirtieth-pass table already uses for the same physics.
const RETAGGED_63: Record<string, string> = {
  "phys-nuclear-binding": "nuclear.sp-04", // 4.4(b) mass-energy equivalence for binding energy (was sp-03, activity and half-life)
  "phys-momentum-impulse": "momentum.sp-01", // 3.1(a) momentum and impulse as force x time (was sp-03, elastic vs inelastic)
  "phys-thermal-specific-heat": "thermal.sp-02", // specific heat capacity (was sp-01, internal energy)
  "phys-thermal-ideal-gas": "thermal.sp-03", // pV = nRT (was sp-04)
};

describe("Physics spec-point tags (sixty-third pass)", () => {
  const byId = new Map<string, Question>(seedQuestions.map((q) => [q.id, q]));
  it("the core Physics questions carry the audited point in WJEC and AQA", () => {
    for (const [slug, tag] of Object.entries(RETAGGED_63)) {
      for (const [subjectId, suffix] of [[PHYSICS, ""], ["aqa-alevel-physics", "-aqa"]] as const) {
        const q = byId.get(`cnt:question:${slug}${suffix}`);
        expect(q, `${slug}${suffix}`).toBeDefined();
        expect(q!.parts[0].specPointIds, `${slug}${suffix}`).toEqual([`${subjectId}.${tag}`]);
      }
      expect(TAUGHT_SPEC_POINT_IDS.includes(`${PHYSICS}.${tag}`), tag).toBe(true);
    }
  });

  it("pass 67: pendulum period is tagged to SHM period (sp-05) and the ln V-t time-constant item to RC curves (sp-04)", () => {
    const tagOf = (id: string, part = 0) => seedQuestions.find((q) => q.id === id)?.parts[part]?.specPointIds ?? [];
    expect(tagOf("cnt:question:phys-shm-pendulum")).toEqual([`${PHYSICS}.circular-shm.sp-05`]);
    expect(tagOf("cnt:question:physics-coverage-capacitance-timing-curve")).toEqual([`${PHYSICS}.capacitance.sp-04`]);
  });

  it("pass 70: single-slit width question is tagged to single-slit diffraction (sp-08) and the mains heater rms/peak item to rms and peak values (sp-01)", () => {
    const tagOf = (id: string) => seedQuestions.find((q) => q.id === id)?.parts[0]?.specPointIds ?? [];
    expect(tagOf("cnt:question:physics-statement-waves-sp-08-central-maximum")).toEqual([`${PHYSICS}.waves.sp-08`]);
    expect(tagOf("cnt:question:physics-coverage-alternating-currents-mains-heater")).toEqual([`${PHYSICS}.alternating-currents.sp-01`]);
  });
});
