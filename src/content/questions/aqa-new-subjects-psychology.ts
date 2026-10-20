import { type NewSubjectItem, buildNewSubjectQuestions } from "./aqa-new-subjects-shared";

// AQA A-level Psychology (7182) starter bank: two original questions per
// topic, one recall and one application. Unreviewed.

const items: NewSubjectItem[] = [
  {
    slug: "conformity-types",
    topic: "social-influence",
    stem: "A student joins a new friendship group. She starts saying she likes a band the group likes, but at home she still listens to her old music.",
    parts: [
      ["Identify the type of conformity shown and explain your choice.", 2, ["compliance", "public agreement but no private change of belief"], "This is compliance: she shows public agreement with the group but there is no private change of belief, because at home she keeps her own taste.", 1, "identify and explain compliance"],
      ["Explain which explanation of conformity best accounts for her behaviour.", 2, ["normative social influence", "wish to be liked or accepted by the group"], "Normative social influence explains it: she conforms out of a wish to be liked and accepted by the group, not because she thinks they are right.", 1, "apply normative social influence"],
    ],
  },
  {
    slug: "milgram-proximity",
    topic: "social-influence",
    stem: "In one variation of Milgram's research, the experimenter gave orders by telephone from another room.",
    parts: [
      ["State what happened to obedience in this variation compared with the baseline study.", 1, ["obedience fell"], "Obedience fell: far fewer participants gave the maximum 450 V shock than in the baseline (about 21% compared with 65%).", 3, "recall the effect of proximity"],
      ["Use the agentic state explanation to explain this result.", 3, ["agentic state", "less pressure from authority when absent", "participants felt responsible for their own actions"], "When the authority figure is absent there is less pressure from authority, so participants are less likely to shift into an agentic state; they felt responsible for their own actions and so disobeyed more.", 4, "apply agentic state theory"],
    ],
  },
  {
    slug: "msm-coding",
    topic: "memory",
    stem: "Short-term and long-term memory differ in coding, capacity and duration.",
    parts: [
      ["Outline the capacity and duration of short-term memory.", 2, ["capacity about 7 plus or minus 2 items", "duration about 18 to 30 seconds without rehearsal"], "The capacity of short-term memory is about 7 plus or minus 2 items, and its duration is about 18 to 30 seconds without rehearsal.", 1, "recall STM capacity and duration"],
      ["State how information is mainly coded in short-term and in long-term memory.", 2, ["short-term memory is mainly acoustic", "long-term memory is mainly semantic"], "Short-term memory is mainly acoustic, coding sounds, while long-term memory is mainly semantic, coding meaning.", 1, "recall coding in STM and LTM"],
    ],
  },
  {
    slug: "eyewitness-leading",
    topic: "memory",
    stem: "After a car crash, one witness is asked how fast the cars were going when they 'smashed', and another when they 'hit'.",
    parts: [
      ["Predict the difference in their speed estimates and name the research this is based on.", 2, ["smashed gives higher speed estimates", "Loftus and Palmer"], "The witness asked about 'smashed' would give higher speed estimates than the one asked about 'hit', as found by Loftus and Palmer.", 5, "apply leading-question research"],
      ["Explain one way the cognitive interview could improve the accuracy of the witnesses' recall.", 2, ["report everything", "even details that seem unimportant can act as cues"], "Witnesses are told to report everything, even details that seem unimportant, because these can act as cues that trigger other memories.", 5, "explain a cognitive interview technique"],
    ],
  },
  {
    slug: "strange-situation-types",
    topic: "attachment",
    kind: "mcq",
    stem: "In Ainsworth's Strange Situation, an infant shows little distress when the caregiver leaves and avoids contact when she returns. Which attachment type is this?",
    options: ["Secure (type B)", "Insecure-avoidant (type A)", "Insecure-resistant (type C)", "Disinhibited attachment"],
    correctIndex: 1,
    parts: [["Select the correct option.", 1, ["insecure-avoidant"], "This is insecure-avoidant (type A): little separation anxiety and avoidance of the caregiver at reunion.", 5, "classify attachment types"]],
  },
  {
    slug: "monotropy",
    topic: "attachment",
    stem: "Bowlby proposed a monotropic theory of attachment.",
    parts: [
      ["Explain what Bowlby meant by monotropy and the critical period.", 2, ["one primary attachment figure", "critical period in the first two years or so"], "Monotropy means the infant forms one primary attachment figure that matters more than any other, and this must happen within a critical period, roughly the first two years.", 4, "explain monotropy and the critical period"],
      ["Explain what Bowlby meant by the internal working model.", 2, ["a mental template of relationships", "affects later relationships"], "The first attachment acts as an internal working model, a mental template of what relationships are like, which affects later relationships including as a parent.", 4, "explain the internal working model"],
    ],
  },
  {
    slug: "definitions-abnormality",
    topic: "psychopathology",
    stem: "Ravi feels so anxious that he cannot hold down a job or wash regularly.",
    parts: [
      ["Identify the definition of abnormality that best fits Ravi and explain why.", 2, ["failure to function adequately", "cannot cope with everyday living such as work or hygiene"], "Failure to function adequately fits best, because Ravi cannot cope with everyday living such as work or hygiene.", 1, "apply a definition of abnormality"],
      ["Give one limitation of this definition.", 2, ["judging adequate functioning is subjective", "some people choose unusual lifestyles without a disorder"], "Judging adequate functioning is subjective, and some people choose unusual lifestyles, such as not working, without having a disorder.", 1, "evaluate the failure-to-function definition"],
    ],
  },
  {
    slug: "systematic-desensitisation",
    topic: "psychopathology",
    stem: "A therapist treats a client's phobia of dogs using systematic desensitisation.",
    parts: [
      ["Outline the steps of systematic desensitisation.", 3, ["anxiety hierarchy", "taught relaxation techniques", "gradual exposure while relaxed until each level causes no anxiety"], "The client and therapist build an anxiety hierarchy of situations, the client is taught relaxation techniques, and then there is gradual exposure to each level while relaxed until it causes no anxiety, a process called counterconditioning.", 3, "describe systematic desensitisation"],
      ["Explain how flooding differs from systematic desensitisation.", 2, ["flooding is immediate exposure to the most feared situation", "no gradual hierarchy"], "Flooding is immediate exposure to the most feared situation for a long period, with no gradual hierarchy, until the anxiety fades through extinction.", 3, "compare flooding and systematic desensitisation"],
    ],
  },
  {
    slug: "operant-reinforcement",
    topic: "approaches",
    stem: "A child stops getting a telling-off for leaving the table once he finishes his vegetables, and he now finishes them every night.",
    parts: [
      ["Identify the type of reinforcement shown and explain your answer.", 2, ["negative reinforcement", "removing an unpleasant consequence strengthens the behaviour"], "This is negative reinforcement: removing an unpleasant consequence, the telling-off, strengthens the behaviour of finishing the vegetables.", 2, "identify negative reinforcement"],
      ["Name the psychologist most associated with operant conditioning.", 1, ["Skinner"], "Skinner is most associated with operant conditioning.", 2, "recall Skinner"],
    ],
  },
  {
    slug: "social-learning-mediational",
    topic: "approaches",
    stem: "Social learning theory includes mediational processes between seeing a behaviour and copying it.",
    parts: [
      ["Name the four mediational processes.", 2, ["attention and retention", "reproduction and motivation"], "The four mediational processes are attention and retention, followed by reproduction and motivation.", 2, "recall mediational processes"],
      ["Explain what is meant by vicarious reinforcement.", 2, ["learning by seeing another person rewarded", "makes imitation more likely"], "Vicarious reinforcement is learning by seeing another person rewarded for a behaviour, which makes imitation more likely.", 2, "explain vicarious reinforcement"],
    ],
  },
  {
    slug: "synaptic-transmission",
    topic: "biopsychology",
    stem: "Neurons communicate across synapses.",
    parts: [
      ["Describe the process of synaptic transmission.", 4, ["neurotransmitter is released from vesicles", "crosses the synaptic gap", "binds to receptors on the postsynaptic neuron", "excitatory or inhibitory effect"], "When an impulse arrives, neurotransmitter is released from vesicles in the presynaptic terminal, crosses the synaptic gap, and binds to receptors on the postsynaptic neuron, where it has an excitatory or inhibitory effect.", 2, "describe synaptic transmission"],
    ],
  },
  {
    slug: "brain-scanning",
    topic: "biopsychology",
    stem: "A researcher wants to know exactly when the brain responds to a sudden sound, to the millisecond.",
    parts: [
      ["Recommend EEG/ERP or fMRI for this study and justify your choice.", 2, ["ERP or EEG", "high temporal resolution of milliseconds"], "ERP or EEG should be used because they have high temporal resolution, measuring electrical changes within milliseconds, whereas fMRI responds over seconds.", 5, "choose a method for studying the brain"],
      ["Give one limitation of the method you chose.", 1, ["poor spatial resolution"], "EEG has poor spatial resolution, so it is hard to tell which exact brain area produced the activity.", 5, "evaluate EEG"],
    ],
  },
  {
    slug: "hypothesis-design",
    topic: "research-methods",
    stem: "A psychologist tests whether students recall more words in a quiet room than with music playing. Different students are used in each condition.",
    parts: [
      ["Name the experimental design and give one weakness of it.", 2, ["independent groups", "participant variables may differ between groups"], "This is an independent groups design; a weakness is that participant variables, such as memory ability, may differ between groups.", 2, "identify and evaluate experimental design"],
      ["Write a directional hypothesis for this study.", 2, ["students recall more words in a quiet room", "than with music playing"], "Students recall more words from a list of 20 in a quiet room than with music playing.", 2, "write an operationalised directional hypothesis"],
    ],
  },
  {
    slug: "type-one-error",
    topic: "research-methods",
    kind: "mcq",
    stem: "A researcher uses a significance level of p ≤ 0.10 instead of p ≤ 0.05. What risk does this increase?",
    options: ["A Type II error", "A Type I error", "Researcher bias", "Order effects"],
    correctIndex: 1,
    parts: [["Select the correct option.", 1, ["Type I error"], "A more lenient significance level increases the risk of a Type I error, rejecting a true null hypothesis.", 6, "relate significance level to Type I error"]],
  },
  {
    slug: "determinism",
    topic: "issues-debates",
    stem: "The biological approach explains OCD in terms of genes and serotonin.",
    parts: [
      ["Explain why this explanation is an example of determinism.", 2, ["behaviour is caused by internal biological factors", "outside the person's conscious control"], "It is determinist because it says behaviour is caused by internal biological factors such as genes and serotonin, outside the person's conscious control.", 2, "apply biological determinism"],
      ["Explain the difference between hard and soft determinism.", 2, ["hard determinism says all behaviour is caused", "soft determinism allows some conscious choice"], "Hard determinism says all behaviour is caused and free will is an illusion, while soft determinism allows some conscious choice within limits.", 2, "distinguish hard and soft determinism"],
    ],
  },
  {
    slug: "gender-bias",
    topic: "issues-debates",
    stem: "A theory of moral development was based only on studies of boys and then applied to girls.",
    parts: [
      ["Identify the type of bias this shows and explain why.", 2, ["androcentrism", "male behaviour is treated as the norm"], "This shows androcentrism: male behaviour is treated as the norm, so girls who differ are judged against a male standard.", 1, "identify androcentrism"],
      ["Explain the difference between alpha bias and beta bias.", 2, ["alpha bias exaggerates differences between genders", "beta bias minimises or ignores differences"], "Alpha bias exaggerates differences between genders, while beta bias minimises or ignores differences between them.", 1, "distinguish alpha and beta bias"],
    ],
  },
  {
    slug: "social-exchange",
    topic: "relationships",
    stem: "Sam stays with his partner even though he is unhappy, because he cannot imagine a better relationship elsewhere.",
    parts: [
      ["Use social exchange theory to explain why Sam stays.", 3, ["comparison level for alternatives", "no better alternative is available", "rewards still outweigh the costs of leaving"], "In social exchange theory his comparison level for alternatives is low: no better alternative is available, so the rewards of staying still outweigh the costs of leaving.", 3, "apply social exchange theory"],
    ],
  },
  {
    slug: "filter-theory",
    topic: "relationships",
    stem: "Filter theory proposes that we narrow the field of available partners in stages.",
    parts: [
      ["Name the three filters in filter theory in the correct order.", 3, ["social demography", "similarity in attitudes", "complementarity of needs"], "The filters are social demography first, then similarity in attitudes, and finally complementarity of needs.", 2, "recall filter theory"],
    ],
  },
  {
    slug: "positive-negative-symptoms",
    topic: "schizophrenia",
    stem: "A patient hears voices that no one else can hear and also shows little motivation to do anything.",
    parts: [
      ["Classify each of these as a positive or a negative symptom.", 2, ["hearing voices is a hallucination, a positive symptom", "lack of motivation is avolition, a negative symptom"], "Hearing voices is a hallucination, a positive symptom because it adds to ordinary experience. Lack of motivation is avolition, a negative symptom because it takes away normal functioning.", 1, "classify symptoms"],
      ["Explain what is meant by symptom overlap and why it is a problem for diagnosis.", 2, ["symptoms are shared with other disorders such as bipolar disorder", "reduces the validity of diagnosis"], "Symptom overlap means symptoms are shared with other disorders such as bipolar disorder, which reduces the validity of diagnosis.", 1, "explain symptom overlap"],
    ],
  },
  {
    slug: "dopamine-hypothesis",
    topic: "schizophrenia",
    stem: "Typical antipsychotics such as chlorpromazine reduce positive symptoms.",
    parts: [
      ["Explain how this supports the dopamine hypothesis.", 2, ["they block dopamine receptors", "reducing dopamine activity reduces positive symptoms"], "Typical antipsychotics block dopamine receptors, and reducing dopamine activity reduces positive symptoms, which suggests excess dopamine contributes to them.", 2, "link drug action to the dopamine hypothesis"],
    ],
  },
  {
    slug: "deindividuation",
    topic: "aggression",
    stem: "Football fans wearing identical masks are more aggressive in a crowd than when alone.",
    parts: [
      ["Use deindividuation to explain this behaviour.", 3, ["anonymity in a crowd", "reduced self-awareness", "weakened restraint on aggressive behaviour"], "Anonymity in a crowd, increased by the masks, reduces self-awareness and concern about being judged, which weakens restraint on aggressive behaviour.", 3, "apply deindividuation"],
    ],
  },
  {
    slug: "institutional-aggression",
    topic: "aggression",
    stem: "Two explanations of aggression in prisons are the importation model and the deprivation model.",
    parts: [
      ["Explain the difference between the two explanations.", 2, ["importation says inmates bring aggressive traits from outside", "deprivation says prison conditions such as loss of freedom cause aggression"], "The importation model says inmates bring aggressive traits and norms from outside prison, while the deprivation model says prison conditions such as loss of freedom and goods cause aggression.", 4, "distinguish dispositional and situational explanations"],
    ],
  },
];

export const aqaPsychologyQuestions = buildNewSubjectQuestions("aqa-alevel-psychology", items);
