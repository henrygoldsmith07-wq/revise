import { describe, expect, it } from "vitest";
import { authenticExpansionQuestions, seedQuestions } from "@/content";
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
