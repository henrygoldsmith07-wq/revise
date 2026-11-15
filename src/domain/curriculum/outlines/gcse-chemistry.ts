import type { UnitSpec } from "../helpers";

// ---------------------------------------------------------------------------
// The GCSE chemistry outline. The GCSE chemistry specifications of the boards
// that examine in England (AQA, Pearson Edexcel, OCR, and WJEC as Eduqas) are
// built on the DfE "GCSE subject content: biology, chemistry and physics"
// (2014, updated May 2019, pages 21-32). WJEC's GCSE for Wales is regulated
// separately and is not built on it, though most of its chemistry is the
// same. The statements below are that document's chemistry bullets, lightly
// condensed, under its own headings; they are not any one board's numbering
// or topic order, and the subject pages say so. The document's "use of
// mathematics" lists are skills across the topics, not topics, and are left
// out. A bullet that sets several separate requirements is split (the
// transition metals, potable water) so each statement asks for one thing.
//
// Until this outline, every GCSE chemistry subject was built from the WJEC
// A-level outline (Kc, orders of reaction, electrode potentials, NMR), so
// its lessons and flashcards were A-level material. As with GCSE physics,
// slugs here never match an A-level slug, and the A-level seed cards a
// learner already has are retired (../../card-retirement.ts).
//
// The key points and common errors were written by Revise and are not
// teacher-reviewed.
// ---------------------------------------------------------------------------

const SOURCE = { source: "authored", verification: "unverified", lastChecked: "2026-11-14", specVersion: "2024-1.0" } as const;
const ref = (area: string) => `DfE chemistry: ${area}`;

/** Each topic's assessment objectives: those of its statements. */
function withTopicAos(units: UnitSpec[]): UnitSpec[] {
  return units.map((unit) => ({
    ...unit,
    topics: unit.topics.map((topic) => ({
      ...topic,
      aos: [...new Set((topic.specPoints ?? []).flatMap((point) => point.aos ?? []))].sort(),
    })),
  }));
}

export const GCSE_CHEMISTRY_OUTLINE: UnitSpec[] = withTopicAos([
  {
    slug: "gcse-atomic-periodic",
    title: "Atomic structure and the Periodic Table",
    topics: [
      {
        slug: "atoms-isotopes-model",
        title: "Atoms, isotopes and the model of the atom",
        specRef: ref("Atomic structure and the Periodic Table"),
        difficulty: 1,
        summary: "The nuclear atom, the sizes of atoms, how the model changed, the charges and masses of the subatomic particles, and counting them in atoms, ions and isotopes.",
        keyPoints: [
          "Nuclear atom: a tiny positive nucleus holds almost all the mass, surrounded by negative electrons; the nucleus is about 1/10 000 of the atom's radius.",
          "Atom size: an atom has a radius of about 0.1 nm (10⁻¹⁰ m), and small molecules are a little larger.",
          "Subatomic particles: a proton has charge +1 and mass 1, a neutron charge 0 and mass 1, an electron charge −1 and almost no mass.",
          "Counting particles: protons = atomic number, neutrons = mass number − atomic number, and an ion has gained or lost electrons.",
          "Isotopes: atoms of the same element with the same number of protons and a different number of neutrons.",
          "Changing model: the plum pudding model was replaced by the nuclear model after alpha particles were scattered by gold foil.",
        ],
        commonErrors: [
          "Giving the mass number as the number of neutrons.",
          "Changing the number of protons to form an ion instead of the number of electrons.",
          "Saying isotopes have different numbers of protons.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: A simple model of the atom", text: "describe the atom as a positively charged nucleus surrounded by negatively charged electrons, with the nuclear radius much smaller than that of the atom and with most of the mass in the nucleus", aos: ["AO1"] },
          { ref: "DfE chemistry: A simple model of the atom", text: "recall the typical size (order of magnitude) of atoms and small molecules", aos: ["AO1"] },
          { ref: "DfE chemistry: A simple model of the atom", text: "describe how and why the atomic model has changed over time", aos: ["AO1"] },
          { ref: "DfE chemistry: A simple model of the atom", text: "recall relative charges and approximate relative masses of protons, neutrons and electrons", aos: ["AO1"] },
          { ref: "DfE chemistry: A simple model of the atom", text: "calculate numbers of protons, neutrons and electrons in atoms and ions, given atomic number and mass number of isotopes", aos: ["AO2"] },
        ],
      },
      {
        slug: "periodic-table-groups",
        title: "The Periodic Table and Groups 1, 7 and 0",
        specRef: ref("Atomic structure and the Periodic Table"),
        difficulty: 2,
        summary: "How an element's place in the Periodic Table follows from its electrons, Mendeleev's table, the properties and trends of Groups 1, 7 and 0, and metals against non-metals.",
        keyPoints: [
          "Position: the group number is the number of outer-shell electrons and the period is the number of occupied shells.",
          "Mendeleev: he left gaps and swapped some elements by properties; ordering by atomic number, and isotopes, explained why.",
          "Group 1: the alkali metals react with water to form a hydroxide and hydrogen, and get more reactive down the group because the outer electron is lost more easily.",
          "Group 7: the halogens get less reactive down the group because an extra electron is gained less easily, and a more reactive halogen displaces a less reactive one.",
          "Group 0: the noble gases are unreactive because their outer shells are full.",
          "Metals and non-metals: metals lose electrons to form positive ions and conduct; non-metals gain or share electrons and mostly do not conduct.",
        ],
        commonErrors: [
          "Saying Group 7 gets more reactive down the group, as Group 1 does.",
          "Explaining a trend by the number of outer electrons, which is the same within a group, instead of the distance of the outer shell from the nucleus.",
          "Describing noble gases as unreactive because they have eight electrons, forgetting helium has two.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: The modern Periodic Table", text: "explain how the position of an element in the Periodic Table is related to the arrangement of electrons in its atoms and hence to its atomic number", aos: ["AO1"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "explain in terms of isotopes how this changes the arrangement proposed by Mendeleev", aos: ["AO1"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "use the names and symbols of the first 20 elements, Groups 1, 7 and 0 and other common elements from a supplied Periodic Table to write formulae and balanced chemical equations", aos: ["AO2"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "explain how the reactions of elements are related to the arrangement of electrons in their atoms and hence to their atomic number", aos: ["AO1"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "recall the simple properties of Groups 1, 7 and 0", aos: ["AO1"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "explain how observed simple properties of Groups 1, 7 and 0 depend on the outer shell of electrons of the atoms and predict properties from given trends down the groups", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "predict possible reactions and probable reactivity of elements from their positions in the Periodic Table", aos: ["AO2"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "describe metals and non-metals and explain the differences between them on the basis of their characteristic physical and chemical properties", aos: ["AO1"] },
          { ref: "DfE chemistry: The modern Periodic Table", text: "explain how the atomic structure of metals and non-metals relates to their position in the Periodic Table", aos: ["AO1"] },
        ],
      },
      {
        slug: "transition-metal-properties",
        title: "Properties of transition metals",
        specRef: ref("Atomic structure and the Periodic Table"),
        difficulty: 2,
        summary: "How transition metals differ from Group 1 metals: their physical properties, coloured ions with different charges, and use as catalysts.",
        keyPoints: [
          "Physical properties: transition metals have higher melting points and densities than Group 1 metals, and are harder and stronger.",
          "Reactivity: transition metals react much less vigorously with water and oxygen than Group 1 metals.",
          "Ions: many transition metals form ions with different charges, such as Fe²⁺ and Fe³⁺, and their compounds are often coloured.",
          "Catalysts: transition metals and their compounds are used as catalysts, such as iron in the Haber process.",
        ],
        commonErrors: [
          "Saying transition metals are more reactive than Group 1 metals.",
          "Assuming a transition metal forms only one ion, as a Group 1 or Group 2 metal does.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Properties of transition metals", text: "recall the general physical properties of transition metals (melting point, density) and their reactivity compared with Group 1, exemplified by a small number of transition metals", aos: ["AO1"] },
          { ref: "DfE chemistry: Properties of transition metals", text: "recall that transition metals form coloured ions with different charges, exemplified by a small number of transition metals", aos: ["AO1"] },
          { ref: "DfE chemistry: Properties of transition metals", text: "recall that transition metals and their compounds are used as catalysts, exemplified by a small number of transition metals", aos: ["AO1"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-structure-bonding",
    title: "Structure, bonding and the properties of matter",
    topics: [
      {
        slug: "states-particle-model",
        title: "States of matter and the particle model",
        specRef: ref("Structure, bonding and the properties of matter"),
        difficulty: 1,
        summary: "Solids, liquids and gases in the particle model, physical against chemical change, the model's limits, and why substances melt and boil at different temperatures.",
        keyPoints: [
          "Particle model: particles in a solid vibrate in fixed positions, in a liquid move past each other while touching, and in a gas move fast and far apart.",
          "Physical change: a change of state is physical and reversible because no new substance is made; a chemical change makes a new substance.",
          "Model limits: the model treats particles as solid spheres with no forces between them, which they are not.",
          "Melting and boiling: the stronger the forces or bonds that must be overcome, the more energy is needed and the higher the melting or boiling point.",
          "Predicting state: a substance is solid below its melting point, liquid between its melting and boiling points, and gas above its boiling point.",
        ],
        commonErrors: [
          "Saying the covalent bonds inside molecules break when a simple molecular substance boils, rather than the forces between molecules.",
          "Calling a change of state a chemical reaction.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: States of matter and change of state", text: "recall and explain the main features of the particle model in terms of the states of matter and change of state, distinguishing between physical and chemical changes", aos: ["AO1"] },
          { ref: "DfE chemistry: States of matter and change of state", text: "explain the limitations of the particle model in relation to changes of state when particles are represented by inelastic spheres", aos: ["AO1"] },
          { ref: "DfE chemistry: States of matter and change of state", text: "use ideas about energy transfers and the relative strength of chemical bonds and intermolecular forces to explain the different temperatures at which changes of state occur", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: States of matter and change of state", text: "use data to predict states of substances under given conditions", aos: ["AO2"] },
        ],
      },
      {
        slug: "ionic-covalent-metallic",
        title: "Ionic, covalent and metallic bonding",
        specRef: ref("Structure, bonding and the properties of matter"),
        difficulty: 2,
        summary: "The three kinds of chemical bond, dot and cross diagrams and their limits, and how a material's bonding and structure explain its properties.",
        keyPoints: [
          "Ionic bonding: metal atoms transfer electrons to non-metal atoms, and the oppositely charged ions attract in a giant lattice.",
          "Covalent bonding: non-metal atoms share pairs of electrons, forming simple molecules or giant covalent structures.",
          "Metallic bonding: positive metal ions sit in a sea of delocalised electrons, which attract them and can move to carry a current.",
          "Ionic properties: ionic compounds have high melting points and conduct only when molten or dissolved, when the ions are free to move.",
          "Simple molecules: weak forces between the molecules give low melting and boiling points, and with no charged particles free to move they do not conduct.",
          "Diagram limits: dot and cross diagrams do not show shape or size, and ball and stick models show gaps and bonds as sticks that are not really there.",
        ],
        commonErrors: [
          "Saying ionic compounds conduct when solid.",
          "Explaining a simple molecular substance's low boiling point by weak covalent bonds.",
          "Saying electrons move in an ionic solution, instead of the ions.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Different kinds of chemical bonds", text: "describe and compare the nature and arrangement of chemical bonds in ionic compounds, simple molecules, giant covalent structures, polymers and metals", aos: ["AO1"] },
          { ref: "DfE chemistry: Different kinds of chemical bonds", text: "explain chemical bonding in terms of electrostatic forces and the transfer or sharing of electrons", aos: ["AO1"] },
          { ref: "DfE chemistry: Different kinds of chemical bonds", text: "construct dot and cross diagrams for simple ionic and covalent substances", aos: ["AO2"] },
          { ref: "DfE chemistry: Different kinds of chemical bonds", text: "describe the limitations of particular representations and models, including dot and cross diagrams, ball and stick models and two and three dimensional representations", aos: ["AO1", "AO3"] },
          { ref: "DfE chemistry: Different kinds of chemical bonds", text: "explain how the bulk properties of materials are related to the types of bonds they contain, their bond strengths in relation to intermolecular forces and the ways in which their bonds are arranged, recognising that the atoms themselves do not have these properties", aos: ["AO1", "AO2"] },
        ],
      },
      {
        slug: "carbon-structures",
        title: "Structure and bonding of carbon",
        specRef: ref("Structure, bonding and the properties of matter"),
        difficulty: 2,
        summary: "Carbon's four covalent bonds, why it forms so many compounds, and the structures and properties of diamond, graphite, fullerenes and graphene.",
        keyPoints: [
          "Four bonds: a carbon atom forms four covalent bonds, so carbon atoms can join in chains and rings and form families of compounds.",
          "Diamond: each carbon is bonded to four others in a giant covalent structure, so diamond is very hard, has a very high melting point and does not conduct.",
          "Graphite: each carbon is bonded to three others in layers that slide, with one delocalised electron per atom, so graphite is soft and conducts.",
          "Graphene and fullerenes: graphene is a single layer of graphite, strong and conducting; fullerenes are hollow molecules of carbon such as C₆₀ and nanotubes.",
        ],
        commonErrors: [
          "Saying graphite is soft because its covalent bonds are weak, rather than because its layers are held together weakly.",
          "Saying diamond conducts because it is carbon, as graphite does.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Structure and bonding of carbon", text: "recall that carbon can form four covalent bonds", aos: ["AO1"] },
          { ref: "DfE chemistry: Structure and bonding of carbon", text: "explain that the vast array of natural and synthetic organic compounds occur due to the ability of carbon to form families of similar compounds, chains and rings", aos: ["AO1"] },
          { ref: "DfE chemistry: Structure and bonding of carbon", text: "explain the properties of diamond, graphite, fullerenes and graphene in terms of their structures and bonding", aos: ["AO1", "AO2"] },
        ],
      },
      {
        slug: "nanoparticles-surface",
        title: "Nanoparticles and surface area",
        specRef: ref("Structure, bonding and the properties of matter"),
        difficulty: 2,
        summary: "The scale of nanoparticles, surface area to volume ratio, and the uses and possible risks of nanoparticulate materials.",
        keyPoints: [
          "Nanoparticle size: nanoparticles are 1–100 nm across (1 nm = 10⁻⁹ m), so contain only a few hundred atoms.",
          "Surface area to volume: as a particle gets smaller its surface area to volume ratio increases; dividing a cube's side by 10 multiplies the ratio by 10.",
          "Nanoparticle uses: a large surface area makes nanoparticles good catalysts and lets them be used in sun creams, cosmetics and medicines.",
          "Nanoparticle risks: nanoparticles may enter cells and the body in ways larger particles cannot, and their long-term effects are not yet known.",
        ],
        commonErrors: [
          "Saying a smaller particle has a larger surface area, rather than a larger surface area to volume ratio.",
          "Confusing a nanometre (10⁻⁹ m) with a micrometre (10⁻⁶ m).",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Bulk and surface properties of matter including nanoparticles", text: "compare 'nano' dimensions to typical dimensions of atoms and molecules", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Bulk and surface properties of matter including nanoparticles", text: "describe the surface area to volume relationship for different-sized particles and describe how this affects properties", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Bulk and surface properties of matter including nanoparticles", text: "describe how the properties of nanoparticulate materials are related to their uses", aos: ["AO1"] },
          { ref: "DfE chemistry: Bulk and surface properties of matter including nanoparticles", text: "explain the possible risks associated with some nanoparticulate materials", aos: ["AO1", "AO3"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-chemical-changes",
    title: "Chemical changes",
    topics: [
      {
        slug: "formulae-equations",
        title: "Formulae and balanced equations",
        specRef: ref("Chemical changes"),
        difficulty: 2,
        summary: "Writing formulae of elements and compounds, empirical formulae, balanced, ionic and half equations, and state symbols.",
        keyPoints: [
          "Balancing: an equation is balanced when each side has the same number of atoms of each element, because mass is conserved; change only the numbers in front of formulae.",
          "Ionic formulae: the charges of the ions in a compound add up to zero, so sodium oxide is Na₂O and magnesium chloride is MgCl₂.",
          "Empirical formula: the simplest whole-number ratio of atoms of each element in a compound.",
          "State symbols: (s) solid, (l) liquid, (g) gas and (aq) dissolved in water.",
          "Ionic equations: only the ions that react are written; the spectator ions are left out, as in H⁺ + OH⁻ → H₂O.",
        ],
        commonErrors: [
          "Changing a subscript in a formula to balance an equation.",
          "Writing (l) for a substance dissolved in water instead of (aq).",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Chemical symbols, formulae and equations", text: "use chemical symbols to write the formulae of elements and simple covalent and ionic compounds", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Chemical symbols, formulae and equations", text: "deduce the empirical formula of a compound from the relative numbers of atoms present or from a model or diagram and vice versa", aos: ["AO2"] },
          { ref: "DfE chemistry: Chemical symbols, formulae and equations", text: "use the names and symbols of common elements and compounds and the principle of conservation of mass to write formulae and balanced chemical equations and half equations", aos: ["AO2"] },
          { ref: "DfE chemistry: Chemical symbols, formulae and equations", text: "use the formulae of common ions to deduce the formula of a compound and write balanced ionic equations", aos: ["AO2"] },
          { ref: "DfE chemistry: Chemical symbols, formulae and equations", text: "describe the physical states of products and reactants using state symbols (s, l, g and aq)", aos: ["AO1"] },
        ],
      },
      {
        slug: "acids-alkalis-ph",
        title: "Acids, alkalis and pH",
        specRef: ref("Chemical changes"),
        difficulty: 2,
        summary: "Reactions of acids with metals and carbonates, hydrogen and hydroxide ions, neutralisation, strong against concentrated acids, and the pH scale.",
        keyPoints: [
          "Acid reactions: acid + metal → salt + hydrogen; acid + carbonate → salt + water + carbon dioxide; acid + alkali → salt + water.",
          "Ions in water: acids form hydrogen ions (H⁺) in water and alkalis form hydroxide ions (OH⁻); neutralisation is H⁺ + OH⁻ → H₂O.",
          "Strong and weak: a strong acid is fully ionised in water and a weak acid only partly; this is not the same as concentrated or dilute, which is the amount of acid in a volume.",
          "pH and H⁺: each fall of one pH unit means ten times the concentration of hydrogen ions.",
          "pH scale: below 7 is acidic, 7 is neutral and above 7 is alkaline; the lower the pH, the higher the hydrogen ion concentration.",
        ],
        commonErrors: [
          "Using 'strong' to mean 'concentrated'.",
          "Saying a fall of 2 pH units doubles the hydrogen ion concentration, rather than multiplying it by 100.",
          "Leaving carbon dioxide out of the products of an acid and a carbonate.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Chemistry of acids", text: "recall that acids react with some metals and with carbonates and write equations predicting products from given reactants", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "recall that acids form hydrogen ions when they dissolve in water and solutions of alkalis contain hydroxide ions", aos: ["AO1"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "recall that relative acidity and alkalinity are measured by pH", aos: ["AO1"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "describe neutralisation as acid reacting with alkali to form a salt plus water", aos: ["AO1"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "recognise that aqueous neutralisation reactions can be generalised to hydrogen ions reacting with hydroxide ions to form water", aos: ["AO1"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "use and explain the terms dilute and concentrated (amount of substance) and weak and strong (degree of ionisation) in relation to acids", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "recall that as hydrogen ion concentration increases by a factor of ten the pH value of a solution decreases by one", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Chemistry of acids", text: "describe neutrality and relative acidity and alkalinity in terms of the effect of the concentration of hydrogen ions on the numerical value of pH (whole numbers only)", aos: ["AO1"] },
        ],
      },
      {
        slug: "reactivity-redox",
        title: "The reactivity series and redox",
        specRef: ref("Chemical changes"),
        difficulty: 2,
        summary: "Why metals differ in reactivity, ordering metals from experiments, and oxidation and reduction as loss or gain of oxygen and of electrons.",
        keyPoints: [
          "Reactivity: a more reactive metal forms its positive ion more easily, so reacts more vigorously with water or dilute acid.",
          "Ordering metals: a more reactive metal displaces a less reactive metal from a solution of its compound.",
          "Oxygen definition: oxidation is gain of oxygen and reduction is loss of oxygen.",
          "Electron definition: oxidation is loss of electrons and reduction is gain of electrons (OIL RIG).",
        ],
        commonErrors: [
          "Saying the metal that is displaced is oxidised, when it is the metal ion that is reduced.",
          "Swapping the electron definitions: oxidation is loss of electrons, not gain.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: A reactivity series of metals", text: "explain how the reactivity of metals with water or dilute acids is related to the tendency of the metal to form its positive ion", aos: ["AO1"] },
          { ref: "DfE chemistry: A reactivity series of metals", text: "deduce an order of reactivity of metals based on experimental results", aos: ["AO3"] },
          { ref: "DfE chemistry: Redox reactions", text: "explain reduction and oxidation in terms of loss or gain of oxygen, identifying which species are oxidised and which are reduced", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Redox reactions", text: "explain reduction and oxidation in terms of gain or loss of electrons, identifying which species are oxidised and which are reduced", aos: ["AO1", "AO2"] },
        ],
      },
      {
        slug: "electrolysis-ions",
        title: "Electrolysis",
        specRef: ref("Chemical changes"),
        difficulty: 2,
        summary: "Electrolysis of molten and dissolved ionic compounds: the ions present, what forms at each electrode, and competing reactions in solution.",
        keyPoints: [
          "Electrolysis: an ionic compound that is molten or dissolved conducts, and a current splits it into elements as the ions move to the electrodes.",
          "Electrodes: positive ions (metals or hydrogen) move to the cathode and are reduced; negative ions (non-metals) move to the anode and are oxidised.",
          "Molten compounds: a molten binary compound gives the metal at the cathode and the non-metal at the anode, as lead bromide gives lead and bromine.",
          "Aqueous solutions: hydrogen forms at the cathode unless the metal is less reactive than hydrogen; oxygen forms at the anode unless a halide ion is present.",
        ],
        commonErrors: [
          "Saying electrons flow through the electrolyte, rather than ions.",
          "Predicting sodium at the cathode in the electrolysis of sodium chloride solution, where hydrogen forms.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Electrolysis of molten ionic liquids and aqueous ionic solutions", text: "describe electrolysis in terms of the ions present and reactions at the electrodes", aos: ["AO1"] },
          { ref: "DfE chemistry: Electrolysis of molten ionic liquids and aqueous ionic solutions", text: "recall that metals (or hydrogen) are formed at the cathode and non-metals are formed at the anode in electrolysis using inert electrodes", aos: ["AO1"] },
          { ref: "DfE chemistry: Electrolysis of molten ionic liquids and aqueous ionic solutions", text: "predict the products of electrolysis of binary ionic compounds in the molten state", aos: ["AO2"] },
          { ref: "DfE chemistry: Electrolysis of molten ionic liquids and aqueous ionic solutions", text: "describe competing reactions in the electrolysis of aqueous solutions of ionic compounds in terms of the different species present", aos: ["AO1", "AO2"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-energy-changes",
    title: "Energy changes in chemistry",
    topics: [
      {
        slug: "exothermic-endothermic",
        title: "Exothermic and endothermic reactions",
        specRef: ref("Energy changes in chemistry"),
        difficulty: 2,
        summary: "Telling exothermic from endothermic reactions by the surroundings, reaction profiles and activation energy, and energy changes from bond energies.",
        keyPoints: [
          "Exothermic: the reaction transfers energy to the surroundings, so their temperature rises; endothermic reactions take energy in, so it falls.",
          "Reaction profile: an exothermic reaction's products are lower in energy than its reactants; an endothermic reaction's products are higher.",
          "Activation energy: the minimum energy that particles must have to react, shown as the rise from reactants to the peak of the profile.",
          "Bond energies: breaking bonds takes in energy and making bonds releases it; energy change = energy to break bonds − energy released making bonds.",
        ],
        commonErrors: [
          "Saying making bonds takes in energy.",
          "Giving a negative energy change for an endothermic reaction.",
          "Drawing activation energy from the products instead of the reactants.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Exothermic and endothermic reactions", text: "distinguish between endothermic and exothermic reactions on the basis of the temperature change of the surroundings", aos: ["AO1", "AO3"] },
          { ref: "DfE chemistry: Exothermic and endothermic reactions", text: "draw and label a reaction profile for an exothermic and an endothermic reaction, identifying activation energy", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Exothermic and endothermic reactions", text: "explain activation energy as the energy needed for a reaction to occur", aos: ["AO1"] },
          { ref: "DfE chemistry: Exothermic and endothermic reactions", text: "calculate energy changes in a chemical reaction by considering bond making and bond breaking energies", aos: ["AO2"] },
        ],
      },
      {
        slug: "fuels-chemical-cells",
        title: "Fuels, feedstock and chemical cells",
        specRef: ref("Energy changes in chemistry"),
        difficulty: 2,
        summary: "Crude oil as a finite source of fuels and feedstock, chemical cells, and the advantages and disadvantages of fuel cells.",
        keyPoints: [
          "Crude oil: crude oil is the main source of hydrocarbons, used as fuels and as feedstock for the petrochemical industry.",
          "Finite resource: crude oil formed over millions of years and is being used far faster than it forms, so it will run out.",
          "Chemical cells: a cell produces a potential difference until one of its reactants is used up.",
          "Hydrogen fuel cell: hydrogen and oxygen react to give a potential difference, and the only product is water, but hydrogen is hard to store and is often made using fossil fuels.",
        ],
        commonErrors: [
          "Saying a hydrogen fuel cell is pollution-free without considering how the hydrogen was made.",
          "Saying a cell stores electricity, rather than chemical reactants that react to give a potential difference.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Carbon compounds both as fuels and feedstock", text: "recall that crude oil is a main source of hydrocarbons and is a feedstock for the petrochemical industry", aos: ["AO1"] },
          { ref: "DfE chemistry: Carbon compounds both as fuels and feedstock", text: "explain how modern life is crucially dependent upon hydrocarbons and recognise that crude oil is a finite resource", aos: ["AO1"] },
          { ref: "DfE chemistry: Chemical cells and fuel cells", text: "recall that a chemical cell produces a potential difference until the reactants are used up", aos: ["AO1"] },
          { ref: "DfE chemistry: Chemical cells and fuel cells", text: "evaluate the advantages and disadvantages of hydrogen/oxygen and other fuel cells for given uses", aos: ["AO3"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-rates-equilibrium",
    title: "The rate and extent of chemical change",
    topics: [
      {
        slug: "rates-collisions-catalysts",
        title: "Rates of reaction and catalysts",
        specRef: ref("The rate and extent of chemical change"),
        difficulty: 2,
        summary: "Measuring rates, reading rate graphs, how temperature, concentration, pressure and surface area change rate in collision theory, and how catalysts work.",
        keyPoints: [
          "Measuring rate: rate = amount of reactant used or product formed ÷ time, found from a gas volume, a mass loss or the time for a solution to go cloudy.",
          "Rate graphs: the steeper the curve, the faster the reaction; it levels off when a reactant is used up.",
          "Collision theory: particles react only when they collide with at least the activation energy, so rate depends on how often they collide and how hard.",
          "Temperature: a higher temperature makes particles move faster, so they collide more often and more of the collisions have enough energy.",
          "Concentration, pressure and surface area: more crowded particles, or a larger surface area to volume ratio, give more frequent collisions.",
          "Catalysts: a catalyst speeds up a reaction without being used up by giving a route with a lower activation energy; enzymes are biological catalysts.",
        ],
        commonErrors: [
          "Saying a higher concentration gives particles more energy, rather than more frequent collisions.",
          "Saying a catalyst gives the particles more energy.",
          "Saying a larger lump of solid reacts faster.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "suggest practical methods for determining the rate of a given reaction", aos: ["AO3"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "interpret rate of reaction graphs", aos: ["AO2", "AO3"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "describe the effect of changes in temperature, concentration, pressure and surface area on rate of reaction", aos: ["AO1"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "explain the effects on rates of reaction of changes in temperature, concentration and pressure in terms of frequency and energy of collision between particles", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "explain the effects on rates of reaction of changes in the size of the pieces of a reacting solid in terms of surface area to volume ratio", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "describe the characteristics of catalysts and their effect on rates of reaction", aos: ["AO1"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "identify catalysts in reactions", aos: ["AO2"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "explain catalytic action in terms of activation energy", aos: ["AO1"] },
          { ref: "DfE chemistry: Factors that influence the rate of reaction", text: "recall that enzymes act as catalysts in biological systems", aos: ["AO1"] },
        ],
      },
      {
        slug: "reversible-dynamic-equilibrium",
        title: "Reversible reactions and dynamic equilibrium",
        specRef: ref("The rate and extent of chemical change"),
        difficulty: 3,
        summary: "Reversing reactions by changing conditions, dynamic equilibrium, and predicting how concentration, temperature and pressure shift an equilibrium.",
        keyPoints: [
          "Reversible reactions: some reactions go either way depending on conditions, such as heating hydrated copper sulfate.",
          "Dynamic equilibrium: in a closed system the forward and reverse reactions continue at equal rates, so the amounts no longer change.",
          "Temperature: raising the temperature moves the equilibrium in the endothermic direction.",
          "Pressure: raising the pressure moves a gas equilibrium to the side with fewer molecules.",
          "Concentration: adding a reactant moves the equilibrium towards the products, to use it up.",
        ],
        commonErrors: [
          "Saying the reactions stop at equilibrium.",
          "Saying the amounts of reactants and products are equal at equilibrium, rather than their rates.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Reversible reactions and dynamic equilibrium", text: "recall that some reactions may be reversed by altering the reaction conditions", aos: ["AO1"] },
          { ref: "DfE chemistry: Reversible reactions and dynamic equilibrium", text: "recall that dynamic equilibrium occurs when the rates of forward and reverse reactions are equal", aos: ["AO1"] },
          { ref: "DfE chemistry: Reversible reactions and dynamic equilibrium", text: "predict the effect of changing reaction conditions (concentration, temperature and pressure) on equilibrium position and suggest appropriate conditions to produce a particular product", aos: ["AO2"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-organic",
    title: "Organic chemistry",
    topics: [
      {
        slug: "homologous-series-reactions",
        title: "Homologous series and their reactions",
        specRef: ref("Organic chemistry"),
        difficulty: 2,
        summary: "Alkanes, alkenes, alcohols and carboxylic acids: their functional groups, the first four members, and combustion, addition and oxidation.",
        keyPoints: [
          "Homologous series: a family with the same functional group and general formula, whose members differ by CH₂.",
          "Functional groups: alkenes have C=C, alcohols –OH and carboxylic acids –COOH; alkanes have only single bonds.",
          "First four: meth-, eth-, prop- and but- name chains of one to four carbon atoms, as in methane, ethene, propanol and butanoic acid.",
          "Reactions: hydrocarbons and alcohols burn to carbon dioxide and water; alkenes add across the double bond; alcohols oxidise to carboxylic acids.",
          "Generality: members of a series react in the same way because their functional group is the same.",
        ],
        commonErrors: [
          "Naming a two-carbon compound with the prefix prop-.",
          "Writing an addition product that still has a C=C double bond.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Homologous series", text: "recognise functional groups and identify members of the same homologous series", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Homologous series", text: "name and draw the structural formulae, using fully displayed formulae, of the first four members of the straight chain alkanes, alkenes, alcohols and carboxylic acids", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Simple reactions of alkanes, alkenes and alcohols", text: "predict the formulae and structures of products of reactions (combustion, addition across a double bond and oxidation of alcohols to carboxylic acids) of the first four and other given members of these homologous series", aos: ["AO2"] },
          { ref: "DfE chemistry: Simple reactions of alkanes, alkenes and alcohols", text: "recall that it is the generality of reactions of functional groups that determine the reactions of organic compounds", aos: ["AO1"] },
        ],
      },
      {
        slug: "polymers-natural-synthetic",
        title: "Addition, condensation and natural polymers",
        specRef: ref("Organic chemistry"),
        difficulty: 3,
        summary: "Addition polymers from alkenes, condensation polymers from monomers with two functional groups, and DNA and other natural polymers.",
        keyPoints: [
          "Addition polymerisation: the C=C bonds of many alkene monomers open and join into a long chain with no other product.",
          "Repeating unit: the repeating unit of an addition polymer is the monomer with the double bond now single and bonds out to each side.",
          "Condensation polymerisation: monomers with two functional groups each join and give off a small molecule, such as water, at every link.",
          "Natural polymers: DNA is a polymer of four nucleotides; proteins are polymers of amino acids and starch and cellulose of sugars.",
        ],
        commonErrors: [
          "Leaving the double bond in the repeating unit of an addition polymer.",
          "Forgetting the small molecule given off in condensation polymerisation.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Synthetic and naturally occurring polymers", text: "recall the basic principles of addition polymerisation by reference to the functional group in the monomer and the repeating units in the polymer", aos: ["AO1"] },
          { ref: "DfE chemistry: Synthetic and naturally occurring polymers", text: "deduce the structure of an addition polymer from a simple alkene monomer and vice versa", aos: ["AO2"] },
          { ref: "DfE chemistry: Synthetic and naturally occurring polymers", text: "explain the basic principles of condensation polymerisation by reference to the functional groups of the monomers, the minimum number of functional groups within a monomer, the number of repeating units in the polymer, and simultaneous formation of a small molecule", aos: ["AO1"] },
          { ref: "DfE chemistry: Synthetic and naturally occurring polymers", text: "recall that DNA is a polymer made from four different monomers called nucleotides and that other important naturally-occurring polymers are based on sugars and amino acids", aos: ["AO1"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-analysis",
    title: "Chemical analysis",
    topics: [
      {
        slug: "purity-separation",
        title: "Purity, formulations and separating mixtures",
        specRef: ref("Chemical analysis"),
        difficulty: 2,
        summary: "What pure means in chemistry, formulations, filtration, crystallisation and distillation, chromatography and Rf values, and melting points as a test of purity.",
        keyPoints: [
          "Pure substance: in chemistry a pure substance is a single element or compound, not mixed with anything; in everyday use 'pure' means unadulterated.",
          "Formulations: a formulation is a mixture designed for a use, with each part in a measured amount, such as a paint, fuel or medicine.",
          "Separation methods: filtration removes an insoluble solid, crystallisation recovers a dissolved solid, and simple or fractional distillation separates liquids by boiling point.",
          "Chromatography: substances separate as a mobile phase carries them through a stationary phase; Rf = distance moved by the spot ÷ distance moved by the solvent.",
          "Melting point: a pure substance melts at one sharp temperature; an impure one melts lower and over a range.",
        ],
        commonErrors: [
          "Calling a mixture such as orange juice pure because nothing has been added.",
          "Measuring Rf from the bottom of the paper rather than from the start line.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "explain what is meant by the purity of a substance, distinguishing between the scientific and everyday use of the term 'pure'", aos: ["AO1"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "explain that many useful materials are formulations of mixtures", aos: ["AO1"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "describe, explain and exemplify the processes of filtration, crystallisation, simple distillation, and fractional distillation", aos: ["AO1"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "recall that chromatography involves a stationary and a mobile phase and that separation depends on the distribution between the phases", aos: ["AO1"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "interpret chromatograms, including measuring Rf values", aos: ["AO2", "AO3"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "suggest suitable purification techniques given information about the substances involved", aos: ["AO3"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "use melting point data to distinguish pure from impure substances", aos: ["AO2", "AO3"] },
          { ref: "DfE chemistry: Assessing purity and separating mixtures", text: "suggest chromatographic methods for distinguishing pure from impure substances", aos: ["AO3"] },
        ],
      },
      {
        slug: "mass-conservation-formula-mass",
        title: "Conservation of mass and relative formula mass",
        specRef: ref("Chemical analysis"),
        difficulty: 2,
        summary: "The law of conservation of mass, apparent mass changes when a gas escapes or is gained, and relative formula masses.",
        keyPoints: [
          "Conservation of mass: no atoms are made or destroyed in a reaction, so the total mass of the products equals the total mass of the reactants.",
          "Open containers: mass seems to fall when a gas product escapes and rise when a reactant gas, such as oxygen, joins the solid.",
          "Relative formula mass: the Mr of a compound is the sum of the relative atomic masses of all the atoms in its formula; for CO₂ it is 12 + 2 × 16 = 44.",
          "Equations: in a balanced equation the total Mr of the reactants, each multiplied by its number, equals that of the products.",
        ],
        commonErrors: [
          "Saying mass is lost in a reaction, rather than escaping as a gas.",
          "Forgetting to multiply by the number in front of a formula, or a subscript, when adding up Mr.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Conservation of mass", text: "recall and use the law of conservation of mass", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Conservation of mass", text: "explain any observed changes in mass in non-enclosed systems during a chemical reaction and explain them using the particle model", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Conservation of mass", text: "calculate relative formula masses of species separately and in a balanced chemical equation", aos: ["AO2"] },
        ],
      },
      {
        slug: "moles-reacting-masses",
        title: "Moles, reacting masses and limiting reactants",
        specRef: ref("Chemical analysis"),
        difficulty: 3,
        summary: "The mole and the Avogadro constant, moles from mass, stoichiometry from masses, limiting reactants, reacting masses and concentration in g/dm³.",
        keyPoints: [
          "Mole: one mole of a substance is 6.02 × 10²³ particles (the Avogadro constant), and has a mass in grams equal to its Mr.",
          "Moles from mass: moles = mass ÷ Mr.",
          "Stoichiometry: dividing each reacting mass by its Mr gives the ratio of moles, which gives the numbers in the balanced equation.",
          "Limiting reactant: the reactant that is used up first limits the amount of product; the other is in excess.",
          "Concentration: concentration in g/dm³ = mass of solute ÷ volume of solution in dm³.",
        ],
        commonErrors: [
          "Using the mass ratio from the equation instead of the mole ratio.",
          "Using a volume in cm³ in a concentration in g/dm³ without dividing by 1000.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Use of amount of substance in relation to masses of pure substances", text: "recall and use the definitions of the Avogadro constant (in standard form) and of the mole", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Use of amount of substance in relation to masses of pure substances", text: "explain how the mass of a given substance is related to the amount of that substance in moles and vice versa", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Use of amount of substance in relation to masses of pure substances", text: "deduce the stoichiometry of an equation from the masses of reactants and products and explain the effect of a limiting quantity of a reactant", aos: ["AO2"] },
          { ref: "DfE chemistry: Use of amount of substance in relation to masses of pure substances", text: "use a balanced equation to calculate masses of reactants or products", aos: ["AO2"] },
          { ref: "DfE chemistry: Use of amount of substance in relation to masses of pure substances", text: "explain how the mass of a solute and the volume of the solution is related to the concentration of the solution", aos: ["AO1", "AO2"] },
        ],
      },
      {
        slug: "gas-volumes-concentrations",
        title: "Gas volumes and solution concentrations",
        specRef: ref("Chemical analysis"),
        difficulty: 3,
        summary: "Molar gas volume at room temperature and pressure, concentration in mol/dm³, and the volumes of solutions that react completely in a titration.",
        keyPoints: [
          "Molar gas volume: one mole of any gas takes up 24 dm³ at room temperature and pressure, so volume in dm³ = moles × 24.",
          "Concentration in moles: concentration in mol/dm³ = moles of solute ÷ volume in dm³, and moles = mass ÷ Mr.",
          "Titration: the moles in the measured volume of the known solution, and the equation's ratio, give the moles and so the concentration of the other solution.",
        ],
        commonErrors: [
          "Using 24 cm³ rather than 24 dm³ (24 000 cm³) for a mole of gas.",
          "Leaving out the mole ratio from the equation in a titration calculation.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Use the mole in relation to volumes of gases", text: "describe the relationship between molar amounts of gases and their volumes and vice versa, and calculate the volumes of gases involved in reactions, using the molar gas volume at room temperature and pressure (assumed to be 24 dm³)", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Principles for determining the concentrations of solutions", text: "explain how the concentration of a solution in mol/dm³ is related to the mass of the solute and the volume of the solution", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Principles for determining the concentrations of solutions", text: "explain the relationship between the volume of a solution of known concentration of a substance and the volume or concentration of another substance that react completely together", aos: ["AO2"] },
        ],
      },
      {
        slug: "identifying-gases-ions",
        title: "Identifying gases and ions",
        specRef: ref("Chemical analysis"),
        difficulty: 2,
        summary: "Tests for oxygen, hydrogen, carbon dioxide and chlorine, tests for cations and anions, flame tests, and instrumental methods of analysis.",
        keyPoints: [
          "Gas tests: oxygen relights a glowing splint; hydrogen gives a squeaky pop with a lit splint; carbon dioxide turns limewater milky; chlorine bleaches damp litmus paper.",
          "Flame tests: lithium crimson, sodium yellow, potassium lilac, calcium orange-red and copper green.",
          "Cation tests: sodium hydroxide solution gives coloured hydroxide precipitates, such as blue for copper(II), green for iron(II) and brown for iron(III).",
          "Anion tests: acid with a carbonate fizzes, giving carbon dioxide; silver nitrate gives a precipitate with halides; barium chloride gives white barium sulfate with sulfate.",
          "Instrumental methods: machines such as flame emission spectroscopy are more sensitive, accurate and fast, and compare a result with a reference set.",
        ],
        commonErrors: [
          "Testing for oxygen with a lit splint and for hydrogen with a glowing one.",
          "Confusing the precipitate colours of iron(II) and iron(III) hydroxide.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Identification of common gases", text: "describe tests to identify selected gases including oxygen, hydrogen, carbon dioxide and chlorine", aos: ["AO1"] },
          { ref: "DfE chemistry: Identification of ions by chemical and spectroscopic means", text: "describe tests to identify aqueous cations and aqueous anions", aos: ["AO1"] },
          { ref: "DfE chemistry: Identification of ions by chemical and spectroscopic means", text: "identify species from test results", aos: ["AO2", "AO3"] },
          { ref: "DfE chemistry: Identification of ions by chemical and spectroscopic means", text: "interpret flame tests to identify metal ions, including the ions of lithium, sodium, potassium, calcium and copper", aos: ["AO2"] },
          { ref: "DfE chemistry: Identification of ions by chemical and spectroscopic means", text: "describe the advantages of instrumental methods of analysis (sensitivity, accuracy and speed)", aos: ["AO1"] },
          { ref: "DfE chemistry: Identification of ions by chemical and spectroscopic means", text: "interpret an instrumental result given appropriate data in chart or tabular form, when accompanied by a reference set in the same form", aos: ["AO2", "AO3"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-industry",
    title: "Chemical and allied industries",
    topics: [
      {
        slug: "life-cycle-recycling",
        title: "Life-cycle assessment and recycling",
        specRef: ref("Chemical and allied industries"),
        difficulty: 2,
        summary: "The stages and limits of a life-cycle assessment, reading LCA data, and when recycling a material is worth doing.",
        keyPoints: [
          "Life-cycle assessment: an LCA totals the energy, resources, pollution and waste of a product from raw materials, through manufacture and use, to disposal.",
          "LCA limits: some effects, such as pollution, are hard to give a value to, so an LCA can be selective or biased.",
          "Recycling: recycling saves raw materials, energy and landfill space, and can turn a material into a product with a different use.",
          "Recycling decisions: recycling is viable when collecting, sorting and processing cost less energy and money than making new material.",
        ],
        commonErrors: [
          "Comparing products only by their manufacture and leaving out use and disposal.",
          "Assuming recycling is always the better choice whatever its energy cost.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Life cycle assessment and recycling", text: "describe the basic principles in carrying out a life-cycle assessment of a material or product", aos: ["AO1"] },
          { ref: "DfE chemistry: Life cycle assessment and recycling", text: "interpret data from a life-cycle assessment of a material or product", aos: ["AO3"] },
          { ref: "DfE chemistry: Life cycle assessment and recycling", text: "describe a process where a material or product is recycled for a different use, and explain why this is viable", aos: ["AO1"] },
          { ref: "DfE chemistry: Life cycle assessment and recycling", text: "evaluate factors that affect decisions on recycling", aos: ["AO3"] },
        ],
      },
      {
        slug: "crude-oil-cracking",
        title: "Fractional distillation of crude oil and cracking",
        specRef: ref("Chemical and allied industries"),
        difficulty: 2,
        summary: "Separating crude oil into fractions of alkanes, and cracking long alkanes into shorter, more useful molecules and alkenes.",
        keyPoints: [
          "Fractional distillation: crude oil is heated to a vapour that rises up a column, cooler towards the top, and each fraction condenses where the temperature falls below its boiling point.",
          "Fractions: most fractions are mixtures of alkanes, CₙH₂ₙ₊₂, with similar numbers of carbon atoms; longer chains have higher boiling points.",
          "Cracking: long-chain alkanes are broken into shorter alkanes and alkenes by heating with a catalyst or with steam.",
          "Why crack: there is more demand for short-chain fuels such as petrol than crude oil provides, and the alkenes made are used to make polymers.",
        ],
        commonErrors: [
          "Saying the fractions separate because they have different densities.",
          "Writing a cracking equation whose carbon or hydrogen atoms do not balance.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Fractional distillation of crude oil and cracking", text: "describe and explain the separation of crude oil by fractional distillation", aos: ["AO1"] },
          { ref: "DfE chemistry: Fractional distillation of crude oil and cracking", text: "describe the fractions as largely a mixture of compounds of formula CₙH₂ₙ₊₂ which are members of the alkane homologous series", aos: ["AO1"] },
          { ref: "DfE chemistry: Fractional distillation of crude oil and cracking", text: "describe the production of materials that are more useful by cracking", aos: ["AO1", "AO2"] },
        ],
      },
      {
        slug: "metal-extraction",
        title: "Extracting and purifying metals",
        specRef: ref("Chemical and allied industries"),
        difficulty: 2,
        summary: "Extracting metals by reduction with carbon or by electrolysis depending on their reactivity, and biological methods of extraction.",
        keyPoints: [
          "Carbon reduction: a metal less reactive than carbon, such as iron, is extracted by heating its oxide with carbon, which removes the oxygen.",
          "Electrolysis extraction: a metal more reactive than carbon, such as aluminium, is extracted by electrolysis of its molten compound, which uses a lot of energy.",
          "Biological methods: phytoextraction grows plants that take up metal compounds, and bioleaching uses bacteria; both work on low-grade ores but are slow.",
        ],
        commonErrors: [
          "Saying aluminium can be extracted by heating with carbon.",
          "Saying carbon is oxidised in electrolysis, rather than in reduction of an oxide.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Different methods of extracting and purifying metals", text: "explain, using the position of carbon in the reactivity series, the principles of industrial processes used to extract metals, including extraction of a non-ferrous metal", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: Different methods of extracting and purifying metals", text: "explain why and how electrolysis is used to extract some metals from their ores", aos: ["AO1"] },
          { ref: "DfE chemistry: Different methods of extracting and purifying metals", text: "evaluate alternative biological methods of metal extraction (bacterial and phytoextraction)", aos: ["AO3"] },
        ],
      },
      {
        slug: "corrosion-materials",
        title: "Corrosion, alloys and choosing materials",
        specRef: ref("Chemical and allied industries"),
        difficulty: 2,
        summary: "What causes corrosion and how it is prevented, alloys and their uses, and comparing ceramics, polymers, composites and metals to choose a material.",
        keyPoints: [
          "Rusting: iron rusts only when both oxygen and water are present.",
          "Preventing corrosion: a barrier (paint, oil, plastic) keeps oxygen and water out; sacrificial protection uses a more reactive metal, such as zinc, that corrodes instead.",
          "Alloys: an alloy is a mixture of a metal with other elements; the different-sized atoms stop the layers sliding, so it is harder than the pure metal.",
          "Choosing materials: ceramics are hard but brittle, polymers light and flexible insulators, composites combine a matrix and a reinforcement, and metals are strong conductors.",
        ],
        commonErrors: [
          "Saying zinc protects iron only as a barrier, missing that it corrodes in place of the iron.",
          "Saying an alloy is a compound.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Using materials", text: "describe the conditions which cause corrosion and the process of corrosion, and explain how mitigation is achieved by creating a physical barrier to oxygen and water and by sacrificial protection", aos: ["AO1"] },
          { ref: "DfE chemistry: Using materials", text: "describe the composition of some important alloys in relation to their properties and uses", aos: ["AO1"] },
          { ref: "DfE chemistry: Using materials", text: "compare quantitatively the physical properties of glass and clay ceramics, polymers, composites and metals", aos: ["AO2", "AO3"] },
          { ref: "DfE chemistry: Using materials", text: "explain how the properties of materials are related to their uses and select appropriate materials given details of the usage required", aos: ["AO2", "AO3"] },
        ],
      },
      {
        slug: "industrial-conditions",
        title: "Rate and equilibrium in industrial processes",
        specRef: ref("Chemical and allied industries"),
        difficulty: 3,
        summary: "Reading graphs of conditions against rate, the trade-off between rate and equilibrium yield, and how cost and supply set an industrial process's conditions.",
        keyPoints: [
          "Compromise temperature: a lower temperature can give a higher equilibrium yield for an exothermic reaction but a slower rate, so a moderate temperature is used.",
          "Pressure cost: a higher pressure can raise the yield and the rate of a gas reaction but needs stronger, more expensive plant and more energy.",
          "Catalysts: a catalyst raises the rate so a lower temperature can be used, but it does not change the equilibrium yield.",
          "Economics: the chosen conditions balance yield, rate, the cost and availability of raw materials and energy, and safety.",
        ],
        commonErrors: [
          "Saying the industrial temperature is chosen to give the highest yield.",
          "Saying a catalyst increases the equilibrium yield.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: The balance between equilibrium position and rate in industrial processes", text: "interpret graphs of reaction conditions versus rate", aos: ["AO2", "AO3"] },
          { ref: "DfE chemistry: The balance between equilibrium position and rate in industrial processes", text: "explain the trade-off between rate of production of a desired product and position of equilibrium in some industrially important processes", aos: ["AO1", "AO2"] },
          { ref: "DfE chemistry: The balance between equilibrium position and rate in industrial processes", text: "explain how the commercially used conditions for an industrial process are related to the availability and cost of raw materials and energy supplies, control of equilibrium position and rate", aos: ["AO1", "AO3"] },
        ],
      },
      {
        slug: "fertilisers-haber",
        title: "The Haber process and fertilisers",
        specRef: ref("Chemical and allied industries"),
        difficulty: 2,
        summary: "Why the Haber process matters to food production, nitrogen, phosphorus and potassium in fertilisers, and making fertilisers industrially and in the laboratory.",
        keyPoints: [
          "Haber process: nitrogen and hydrogen react reversibly over an iron catalyst to make ammonia, which is used to make fertilisers.",
          "NPK: fertilisers supply nitrogen, phosphorus and potassium compounds, which plants need to grow, and so raise crop yields.",
          "Industrial production: fertilisers such as ammonium nitrate are made in several linked continuous processes from raw materials such as air, natural gas and phosphate rock.",
          "Laboratory synthesis: in the laboratory a fertiliser salt is made in small batches by titrating an acid with an alkali, such as ammonia with nitric acid.",
        ],
        commonErrors: [
          "Saying the Haber process makes nitrogen fertiliser directly, rather than ammonia.",
          "Confusing the continuous industrial process with a laboratory batch.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Agricultural productivity and the use of nitrogen, phosphorus and potassium-based fertilisers", text: "explain the importance of the Haber process in agricultural production", aos: ["AO1"] },
          { ref: "DfE chemistry: Agricultural productivity and the use of nitrogen, phosphorus and potassium-based fertilisers", text: "recall the importance of nitrogen, phosphorus and potassium compounds in agricultural production", aos: ["AO1"] },
          { ref: "DfE chemistry: Agricultural productivity and the use of nitrogen, phosphorus and potassium-based fertilisers", text: "describe the industrial production of fertilisers as several integrated processes using a variety of raw materials", aos: ["AO1"] },
          { ref: "DfE chemistry: Agricultural productivity and the use of nitrogen, phosphorus and potassium-based fertilisers", text: "compare the industrial production of fertilisers with laboratory syntheses of the same products", aos: ["AO1", "AO3"] },
        ],
      },
      {
        slug: "yield-atom-economy",
        title: "Percentage yield and atom economy",
        specRef: ref("Chemical and allied industries"),
        difficulty: 3,
        summary: "Percentage yield, theoretical yield from a balanced equation, atom economy, and choosing a reaction pathway from yield, rate, equilibrium and by-products.",
        keyPoints: [
          "Percentage yield: percentage yield = actual mass of product ÷ theoretical maximum mass × 100.",
          "Theoretical yield: moles of reactant from its mass, the equation's ratio and the product's Mr give the most product the reaction could make.",
          "Atom economy: atom economy = Mr of the desired product ÷ total Mr of all the reactants × 100.",
          "Choosing a pathway: a route is chosen on atom economy, yield, rate, equilibrium position and whether the by-products can be used or sold.",
        ],
        commonErrors: [
          "Dividing by the products' total Mr in atom economy instead of the reactants'.",
          "Mixing up percentage yield, which is measured, with atom economy, which comes from the equation.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: The comparison of yield and atom economy of chemical reactions", text: "calculate the percentage yield of a reaction product from the actual yield of a reaction", aos: ["AO2"] },
          { ref: "DfE chemistry: The comparison of yield and atom economy of chemical reactions", text: "calculate the theoretical amount of a product from a given amount of reactant", aos: ["AO2"] },
          { ref: "DfE chemistry: The comparison of yield and atom economy of chemical reactions", text: "define the atom economy of a reaction", aos: ["AO1"] },
          { ref: "DfE chemistry: The comparison of yield and atom economy of chemical reactions", text: "calculate the atom economy of a reaction to form a desired product from the balanced equation", aos: ["AO2"] },
          { ref: "DfE chemistry: The comparison of yield and atom economy of chemical reactions", text: "explain why a particular reaction pathway is chosen to produce a specified product given appropriate data such as atom economy (if not calculated), yield, rate, equilibrium position and usefulness of by-products", aos: ["AO3"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-earth-atmosphere",
    title: "Earth and atmospheric science",
    topics: [
      {
        slug: "atmosphere-pollutants",
        title: "The atmosphere: its evolution and pollutants",
        specRef: ref("Earth and atmospheric science"),
        difficulty: 2,
        summary: "How the early atmosphere formed and became rich in oxygen, and the sources and effects of carbon monoxide, sulfur dioxide, nitrogen oxides and particulates.",
        keyPoints: [
          "Early atmosphere: volcanoes released mainly carbon dioxide and water vapour; the water condensed into oceans, which dissolved some of the carbon dioxide.",
          "Oxygen: algae and then plants made oxygen by photosynthesis, and carbon dioxide was locked into sedimentary rocks and fossil fuels.",
          "Carbon monoxide: incomplete combustion of fuels gives carbon monoxide, a toxic gas that stops the blood carrying oxygen.",
          "Sulfur dioxide and nitrogen oxides: sulfur in fuels burns to sulfur dioxide and engines make nitrogen oxides; both cause acid rain and breathing problems.",
          "Particulates: incomplete combustion gives soot particles that damage lungs and dim sunlight (global dimming).",
        ],
        commonErrors: [
          "Saying nitrogen oxides come from nitrogen in the fuel, rather than from nitrogen in the air at high engine temperatures.",
          "Saying the early atmosphere was mainly oxygen.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: The composition and evolution of the Earth's atmosphere", text: "interpret evidence for how it is thought the atmosphere was originally formed", aos: ["AO3"] },
          { ref: "DfE chemistry: The composition and evolution of the Earth's atmosphere", text: "describe how it is thought an oxygen-rich atmosphere developed over time", aos: ["AO1"] },
          { ref: "DfE chemistry: Common atmospheric pollutants and their sources", text: "describe the major sources of carbon monoxide, sulfur dioxide, oxides of nitrogen and particulates in the atmosphere and explain the problems caused by increased amounts of these substances", aos: ["AO1"] },
        ],
      },
      {
        slug: "greenhouse-climate",
        title: "Greenhouse gases and climate change",
        specRef: ref("Earth and atmospheric science"),
        difficulty: 2,
        summary: "The greenhouse effect, the evidence for human causes of climate change and its uncertainties, and the effects of more carbon dioxide and methane and how to reduce them.",
        keyPoints: [
          "Greenhouse effect: the Earth emits infrared radiation, which greenhouse gases such as carbon dioxide, methane and water vapour absorb and re-emit, warming the atmosphere.",
          "Evidence: atmospheric carbon dioxide has risen with fossil fuel use and global temperatures have risen with it, though a correlation alone does not prove the cause.",
          "Effects: climate change can bring rising sea levels, more extreme weather and changes to where crops grow and species live.",
          "Mitigation: using less fossil fuel, capturing and storing carbon, and planting trees reduce emissions, though each has costs and limits.",
        ],
        commonErrors: [
          "Saying greenhouse gases trap sunlight, rather than absorb the infrared radiation the Earth emits.",
          "Confusing the greenhouse effect with the hole in the ozone layer.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: Carbon dioxide and methane as greenhouse gases", text: "describe the greenhouse effect in terms of the interaction of radiation with matter", aos: ["AO1"] },
          { ref: "DfE chemistry: Carbon dioxide and methane as greenhouse gases", text: "evaluate the evidence for additional anthropogenic causes of climate change, including the correlation between change in atmospheric carbon dioxide concentration and the consumption of fossil fuels, and describe the uncertainties in the evidence base", aos: ["AO3"] },
          { ref: "DfE chemistry: Carbon dioxide and methane as greenhouse gases", text: "describe the potential effects of increased levels of carbon dioxide and methane on the Earth's climate and how these effects may be mitigated, including consideration of scale, risk and environmental implications", aos: ["AO1", "AO3"] },
        ],
      },
      {
        slug: "potable-water",
        title: "Water resources and potable water",
        specRef: ref("Earth and atmospheric science"),
        difficulty: 2,
        summary: "Making water safe to drink from fresh ground water, from waste water and from salt water, and the separation techniques each uses.",
        keyPoints: [
          "Potable water: water that is safe to drink, with low levels of dissolved salts and microbes; it is not pure water.",
          "Fresh water: ground or surface water is filtered to remove solids and sterilised with chlorine, ozone or ultraviolet light.",
          "Waste water: sewage is screened, left for solids to settle, and the liquid broken down by bacteria before the water is returned.",
          "Salt water: sea water is made potable by distillation or reverse osmosis, which need a lot of energy.",
        ],
        commonErrors: [
          "Calling potable water pure.",
          "Saying filtration removes dissolved salts from sea water.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE chemistry: The Earth's water resources and obtaining potable water", text: "describe the principal methods for increasing the availability of potable water from ground water, in terms of the separation techniques used", aos: ["AO1"] },
          { ref: "DfE chemistry: The Earth's water resources and obtaining potable water", text: "describe the principal methods for treating waste water, in terms of the separation techniques used and the ease of treatment", aos: ["AO1"] },
          { ref: "DfE chemistry: The Earth's water resources and obtaining potable water", text: "describe the principal methods for obtaining potable water from salt water, in terms of the separation techniques used and the ease of treatment", aos: ["AO1", "AO3"] },
        ],
      },
    ],
  },
]);
