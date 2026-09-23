import { depthQuestions, type PhysicsDepthItem, type PhysicsDepthPart } from "./physics-depth-50-common";

const p = (
  demand: PhysicsDepthPart["demand"], family: string, context: string, move: string,
  prompt: string, marks: number, scheme: string[], answer: string,
): PhysicsDepthPart => ({ demand, family, context, move, prompt, marks, scheme, answer });

/** Small, explicit gap fills for capability cells that were otherwise complete. */
const ITEMS: PhysicsDepthItem[] = [
  {
    topic: "waves", point: 1,
    parts: [
      p("calculation", "deep:waves1:wave-speed", "deep:waves1:wave-speed:ultrasound", "calculate wavelength from measured frequency and speed", "An ultrasound wave travels at 1500 m s⁻¹ at 2.0 MHz. Calculate its wavelength.", 2, ["λ = v/f", "λ = 1500/(2.0×10⁶) = 7.5×10⁻⁴ m"], "The wavelength is 7.5×10⁻⁴ m, or 0.75 mm."),
      p("calculation", "deep:waves1:refracted-wavelength", "deep:waves1:refracted-wavelength:water", "combine preserved frequency with a changed wave speed", "A 12 Hz water wave slows from 0.60 m s⁻¹ to 0.42 m s⁻¹ in shallow water. Calculate both wavelengths and their ratio.", 3, ["λ_deep = 0.60/12 = 0.050 m", "λ_shallow = 0.42/12 = 0.035 m", "Ratio shallow/deep = 0.70"], "The wavelengths are 0.050 m and 0.035 m. Their ratio is 0.70 because the frequency is unchanged."),
    ],
  },
  {
    topic: "waves", point: 4,
    parts: [
      p("calculation", "deep:waves4:critical-angle", "deep:waves4:critical-angle:glass", "calculate critical angle and classify a ray", "A glass-air boundary has n_glass = 1.52. Calculate the critical angle and decide whether a 45° internal ray undergoes total internal reflection.", 3, ["sin C = 1/1.52, giving C = 41.1°", "45° is greater than C", "The ray undergoes total internal reflection"], "C = arcsin(1/1.52) ≈ 41.1°. Since 45° exceeds C, total internal reflection occurs."),
      p("calculation", "deep:waves4:critical-index", "deep:waves4:critical-index:fibre", "infer a refractive index from a measured critical angle", "The critical angle of a transparent core in air is 38°. Calculate its refractive index.", 2, ["n = 1/sin C", "n = 1/sin38° = 1.62"], "The index is 1/sin38° ≈ 1.62."),
    ],
  },
  {
    topic: "momentum", point: 1,
    parts: [
      p("transfer", "deep:momentum1:recoil", "deep:momentum1:recoil:cart", "transfer signed momentum and impulse to an isolated recoil", "A compressed spring between two carts is released. Explain how measuring one cart's recoil can determine the other's momentum when external impulse is negligible.", 3, ["The two-cart system has zero initial momentum", "Internal spring forces give equal and opposite impulses", "The final momenta are equal in magnitude and opposite in direction"], "With negligible external impulse total momentum stays zero. The spring's internal impulses are opposite, so the carts recoil with equal and opposite momenta."),
      p("transfer", "deep:momentum1:impact-sensor", "deep:momentum1:impact-sensor:helmet", "transfer impulse definition to a measured protective pulse", "A helmet sensor records a force-time pulse during impact. Explain how its signed area can be used to infer the rider's change in momentum and what extra measurement is needed for direction.", 3, ["Integrate the force-time trace to obtain impulse", "Impulse equals change in momentum", "A sign convention or vector force direction is needed; a scalar sensor alone gives only a component"], "The signed area gives J = Δp. To know the vector direction, define the sensor axis and calibrate its sign; one scalar trace gives only that component."),
    ],
  },
  {
    topic: "circular-shm", point: 1,
    parts: [
      p("misconception", "deep:circular1:angular-linear", "deep:circular1:angular-linear:wheel", "correct equating angular speed with tangential speed", "A student says a point on a large wheel moves faster because the wheel has a larger angular speed. Explain which quantity actually changes when radius changes.", 3, ["For a rigid wheel all points share the same angular speed ω", "Tangential speed is v = ωr and therefore grows with radius", "A larger radius changes v, not ω"], "Every point turns through the same angle per second, so ω is common. The outer point has larger linear speed because v = ωr."),
      p("misconception", "deep:circular1:radian", "deep:circular1:radian:turntable", "reject mixing degrees per second with radian formulae", "A turntable is quoted at 60° s⁻¹. A student inserts 60 into v = ωr. Correct the unit conversion.", 2, ["Convert angular speed to radians: 60° s⁻¹ = π/3 rad s⁻¹", "Use v = (π/3)r, not 60r"], "The angular speed is π/3 rad s⁻¹. Radian measure is required in v = ωr."),
    ],
  },
  {
    topic: "fields", point: 2,
    parts: [
      p("application", "deep:fields2:vector-components", "deep:fields2:vector-components:gravity", "resolve perpendicular field components before reporting a resultant", "At a point the gravitational field is 6.0 N kg⁻¹ east and 8.0 N kg⁻¹ north. Calculate the resultant field strength and its direction.", 3, ["Resultant = √(6.0²+8.0²) = 10.0 N kg⁻¹", "tan θ = 8.0/6.0", "θ = 53° north of east"], "The perpendicular components give a resultant 10.0 N kg⁻¹ at about 53° north of east."),
      p("application", "deep:fields2:electric-strength", "deep:fields2:electric-strength:plates", "calculate electric field strength and force on a test charge", "Parallel plates are 0.020 m apart with 600 V across them. Calculate the uniform field strength and the force on a 3.0 nC charge.", 3, ["E = V/d = 600/0.020 = 3.0×10⁴ V m⁻¹", "F = qE = 3.0×10⁻⁹×3.0×10⁴", "F = 9.0×10⁻⁵ N in the field direction for a positive charge"], "The field is 3.0×10⁴ V m⁻¹. A positive 3.0 nC charge feels 9.0×10⁻⁵ N along the field."),
    ],
  },
  {
    topic: "alternating-currents", point: 1,
    parts: [
      p("calculation", "deep:ac1:angular-frequency", "deep:ac1:angular-frequency:generator", "extract period from angular frequency before applying the mean-square relation", "A function generator produces v(t) = 120 sin(400πt) volts. Calculate its frequency, period and rms voltage.", 3, ["Angular frequency ω = 400π rad s⁻¹, so f = ω/(2π) = 200 Hz", "Period T = 1/f = 5.0 ms", "V_rms = 120/√2 = 84.9 V"], "The angular frequency gives f = 200 Hz and T = 5.0 ms. The sinusoidal rms voltage is 84.9 V."),
      p("calculation", "deep:ac1:cycle-energy", "deep:ac1:cycle-energy:induction", "use rms heating equivalence to infer energy transferred in one cycle", "An AC current of 5.0 A rms flows through a 20 Ω resistor at 50 Hz. Calculate the mean power and the energy dissipated in one cycle.", 3, ["P_mean = I_rms²R = 5.0²×20 = 500 W", "T = 1/50 = 0.020 s", "Energy per cycle = PT = 10 J"], "The mean power is 500 W. One 50 Hz cycle lasts 0.020 s, so 10 J is dissipated each cycle."),
    ],
  },
];

export const physicsDepthNearCompleteGapQuestions = depthQuestions(ITEMS);
