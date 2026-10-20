import { type NewSubjectItem, buildNewSubjectQuestions } from "./aqa-new-subjects-shared";

// AQA A-level Economics (7136) starter bank: two original questions per
// topic. Unreviewed.

const items: NewSubjectItem[] = [
  {
    slug: "positive-normative",
    topic: "economic-problem",
    kind: "mcq",
    stem: "Which of these is a normative statement?",
    options: [
      "UK unemployment rose last year.",
      "A higher minimum wage would reduce youth employment.",
      "The government should spend more on public transport.",
      "Inflation was 2% in June.",
    ],
    correctIndex: 2,
    parts: [["Select the correct option.", 1, ["the government should spend more on public transport"], "It contains a value judgement, 'should', so it cannot be tested against evidence.", 2, "distinguish positive and normative statements"]],
  },
  {
    slug: "ppf-opportunity-cost",
    topic: "economic-problem",
    stem: "An economy can produce either 100 units of food and 40 units of clothing, or 80 units of food and 60 units of clothing.",
    calculator: false,
    parts: [
      ["Calculate the opportunity cost of the extra 20 units of clothing.", 1, ["20 units of food"], "Moving from 40 to 60 units of clothing means giving up 20 units of food, so the opportunity cost is 20 units of food.", 4, "calculate opportunity cost from a PPF"],
      ["Explain what a point inside the production possibility frontier shows.", 2, ["resources are unemployed or used inefficiently", "more of both goods could be produced"], "A point inside the frontier shows resources are unemployed or used inefficiently, because more of both goods could be produced.", 4, "interpret points inside a PPF"],
    ],
  },
  {
    slug: "diminishing-mu",
    topic: "individual-decisions",
    stem: "A student buys a third cup of coffee in one day but values it less than the first.",
    parts: [
      ["Use the concept of diminishing marginal utility to explain this.", 2, ["each extra unit gives less additional satisfaction", "so the third cup is valued less than the first"], "Under diminishing marginal utility each extra unit consumed gives less additional satisfaction, so the third cup is valued less than the first.", 2, "apply diminishing marginal utility"],
    ],
  },
  {
    slug: "nudge-default",
    topic: "individual-decisions",
    stem: "The government makes workplace pension saving the default, so employees are enrolled unless they choose to opt out.",
    parts: [
      ["Explain why this is an example of a nudge.", 2, ["it changes the choice architecture by setting a default", "people can still opt out so no choice is banned"], "It changes the choice architecture by setting a default option, while people can still opt out, so no choice is banned or heavily penalised.", 5, "identify a nudge"],
      ["Name the bias that makes default options effective.", 1, ["inertia or status quo bias"], "Inertia, or status quo bias, means people tend to stick with whatever happens if they do nothing.", 4, "recall status quo bias"],
    ],
  },
  {
    slug: "ped-calculation",
    topic: "price-determination",
    kind: "calculation",
    stem: "The price of a concert ticket rises from £40 to £44, and the quantity demanded falls from 1 000 to 850.",
    parts: [
      ["Calculate the price elasticity of demand.", 2, ["−15% ÷ 10%", "PED = −1.5"], "Quantity falls by 15% and price rises by 10%, so PED = −15% ÷ 10% = −1.5.", 2, "calculate PED"],
      ["State whether demand is elastic or inelastic and what happens to total revenue.", 2, ["demand is price elastic", "total revenue falls"], "Demand is price elastic because the size of PED is above 1, so total revenue falls from £40 000 to £37 400.", 2, "relate PED to total revenue"],
    ],
  },
  {
    slug: "demand-shift",
    topic: "price-determination",
    stem: "A health report says eating oats lowers cholesterol.",
    parts: [
      ["Explain the effect on the equilibrium price and quantity of oats.", 3, ["demand shifts to the right", "equilibrium price rises", "equilibrium quantity rises"], "The report changes tastes, so demand shifts to the right; at the old price there is excess demand, so the equilibrium price rises and the equilibrium quantity rises.", 4, "analyse a demand shift"],
    ],
  },
  {
    slug: "cost-curves",
    topic: "costs-revenue",
    kind: "mcq",
    stem: "Where does the marginal cost curve cut the average total cost curve?",
    options: ["At the maximum of ATC", "At the minimum of ATC", "Where ATC equals AVC", "Where MC equals MR"],
    correctIndex: 1,
    parts: [["Select the correct option.", 1, ["at the minimum of ATC"], "MC cuts ATC at its minimum: while MC is below ATC it pulls the average down, and above it pulls it up.", 3, "relate marginal and average cost"]],
  },
  {
    slug: "profit-maximisation",
    topic: "costs-revenue",
    stem: "A firm finds that at its current output marginal revenue is £12 and marginal cost is £8.",
    parts: [
      ["Explain whether the firm should increase or decrease output to maximise profit.", 2, ["increase output", "each extra unit adds more to revenue than to cost until MC = MR"], "It should increase output, because each extra unit adds more to revenue than to cost; profit is maximised where MC = MR.", 5, "apply the profit-maximising rule"],
    ],
  },
  {
    slug: "monopoly-outcome",
    topic: "market-structures",
    stem: "A firm is the only supplier of water in a region.",
    parts: [
      ["Explain how a profit-maximising monopolist chooses its price and output.", 2, ["produces where MC = MR", "charges the price consumers will pay on the demand curve"], "A monopolist produces where MC = MR and then charges the price consumers will pay for that output on the demand curve, which is above marginal cost.", 4, "explain monopoly pricing"],
      ["Explain why the monopolist can keep supernormal profit in the long run.", 2, ["high barriers to entry", "new firms cannot enter to compete the profit away"], "There are high barriers to entry, such as the cost of a pipe network, so new firms cannot enter to compete the profit away.", 4, "explain persistence of supernormal profit"],
    ],
  },
  {
    slug: "price-discrimination",
    topic: "market-structures",
    stem: "A train company charges higher fares at peak times than off-peak.",
    parts: [
      ["State two conditions needed for price discrimination.", 2, ["groups have different price elasticities of demand", "the firm can prevent resale between the groups"], "The groups must have different price elasticities of demand, and the firm must be able to prevent resale between the groups, for example with timed tickets.", 4, "recall conditions for price discrimination"],
    ],
  },
  {
    slug: "monopsony-minimum-wage",
    topic: "labour-market",
    stem: "A town has one large employer, which acts as a monopsonist in the local labour market.",
    parts: [
      ["Explain why a monopsonist pays a lower wage than a competitive labour market.", 2, ["it hires fewer workers", "so it can pay a wage below the marginal revenue product"], "Because hiring more workers raises the wage for all of them, the monopsonist hires fewer workers and so can pay a wage below the marginal revenue product.", 4, "explain monopsony wages"],
      ["Explain how a minimum wage could raise both wages and employment here.", 2, ["a minimum wage removes the incentive to restrict hiring", "employment rises towards the competitive level"], "A minimum wage set above the monopsony wage removes the incentive to restrict hiring, because extra workers no longer push up pay, so employment rises towards the competitive level.", 5, "analyse a minimum wage under monopsony"],
    ],
  },
  {
    slug: "derived-demand",
    topic: "labour-market",
    stem: "Demand for builders rises after the government announces a housebuilding programme.",
    parts: [
      ["Explain why the demand for labour is a derived demand.", 2, ["labour is demanded for what it produces", "demand for builders comes from demand for houses"], "Labour is demanded for what it produces, so the demand for builders comes from the demand for houses rather than for labour itself.", 1, "explain derived demand"],
    ],
  },
  {
    slug: "gini-lorenz",
    topic: "income-distribution",
    stem: "Country A has a Gini coefficient of 0.25 and country B a Gini coefficient of 0.45.",
    parts: [
      ["State which country has the more unequal income distribution and how its Lorenz curve differs.", 2, ["country B is more unequal", "its Lorenz curve lies further from the line of equality"], "Country B is more unequal, since a higher coefficient means a bigger gap between the shares of rich and poor, so its Lorenz curve lies further from the line of equality than country A's.", 2, "interpret the Gini coefficient"],
    ],
  },
  {
    slug: "income-wealth",
    topic: "income-distribution",
    stem: "A retired homeowner has a low pension but owns a valuable house.",
    parts: [
      ["Use this example to explain the difference between income and wealth.", 2, ["income is a flow such as the pension", "wealth is a stock of assets such as the house"], "Income is a flow of money over time, such as the pension, while wealth is a stock of assets at a point in time, such as the house, so a person can be wealthy on a low income.", 1, "distinguish income and wealth"],
    ],
  },
  {
    slug: "negative-externality",
    topic: "market-failure",
    stem: "A factory pollutes a river used by local fishermen.",
    parts: [
      ["Explain why the free market overproduces the factory's output.", 2, ["marginal social cost exceeds marginal private cost", "the firm ignores the external cost"], "Marginal social cost exceeds marginal private cost because the firm ignores the external cost to the fishermen, so output is set where private cost meets benefit, above the social optimum.", 3, "analyse a negative externality"],
      ["Explain one way the government could correct this.", 2, ["an indirect tax equal to the marginal external cost", "internalises the externality"], "An indirect tax equal to the marginal external cost raises the firm's costs and internalises the externality, cutting output towards the social optimum.", 6, "evaluate a tax to correct an externality"],
    ],
  },
  {
    slug: "public-good",
    topic: "market-failure",
    stem: "Street lighting is provided by the local council rather than by private firms.",
    parts: [
      ["Use the characteristics of a public good to explain why.", 3, ["non-rival", "non-excludable", "free-rider problem so firms cannot charge"], "Street lighting is non-rival, since one person's use does not reduce another's, and non-excludable, since non-payers cannot be stopped from benefiting; the free-rider problem means firms cannot charge, so the market fails to provide it.", 2, "explain public goods"],
    ],
  },
  {
    slug: "real-gdp",
    topic: "macro-measurement",
    kind: "calculation",
    stem: "Nominal GDP rises by 6% in a year in which the price level rises by 4%.",
    calculator: false,
    parts: [
      ["Estimate the growth in real GDP and explain the difference between real and nominal GDP.", 2, ["about 2%", "real GDP adjusts for inflation"], "Real GDP grows by about 2%, because real GDP adjusts nominal GDP for inflation, leaving the change in the volume of output.", 2, "calculate real growth"],
    ],
  },
  {
    slug: "inflation-measure",
    topic: "macro-measurement",
    stem: "The UK's inflation target is set in terms of the consumer prices index (CPI).",
    parts: [
      ["Explain how the CPI is constructed.", 2, ["a weighted basket of goods and services", "weights reflect the share of household spending"], "The CPI tracks the price of a weighted basket of goods and services, where the weights reflect the share of household spending on each item.", 4, "explain CPI construction"],
    ],
  },
  {
    slug: "multiplier",
    topic: "ad-as",
    kind: "calculation",
    stem: "In a simple economy the marginal propensity to withdraw is 0.25. The government raises spending by £10 billion.",
    calculator: false,
    parts: [
      ["Calculate the multiplier and the final change in national income.", 2, ["multiplier = 1 ÷ 0.25 = 4", "national income rises by £40 billion"], "The multiplier = 1 ÷ 0.25 = 4, so national income rises by £40 billion as the spending is re-spent in successive rounds.", 4, "calculate the multiplier effect"],
    ],
  },
  {
    slug: "ad-components",
    topic: "ad-as",
    kind: "mcq",
    stem: "Which change shifts aggregate demand to the left?",
    options: ["A fall in interest rates", "A rise in consumer confidence", "A rise in income tax", "A depreciation of the pound"],
    correctIndex: 2,
    parts: [["Select the correct option.", 1, ["a rise in income tax"], "A rise in income tax cuts disposable income and so consumption, shifting aggregate demand to the left.", 3, "identify determinants of AD"]],
  },
  {
    slug: "output-gap",
    topic: "economic-performance",
    stem: "In a recession actual GDP is well below the economy's productive potential.",
    parts: [
      ["Identify the type of output gap and the type of unemployment it causes.", 2, ["a negative output gap", "cyclical unemployment"], "This is a negative output gap, with spare capacity, which causes cyclical (demand-deficient) unemployment.", 1, "identify a negative output gap"],
    ],
  },
  {
    slug: "cost-push",
    topic: "economic-performance",
    stem: "A sharp rise in world oil prices raises firms' costs across the economy.",
    parts: [
      ["Explain the type of inflation this causes and its effect on real output.", 3, ["cost-push inflation", "short-run aggregate supply shifts left", "real output falls"], "It causes cost-push inflation: short-run aggregate supply shifts left, so the price level rises while real output falls.", 3, "analyse cost-push inflation"],
    ],
  },
  {
    slug: "bank-rate",
    topic: "monetary-policy",
    stem: "The Bank of England raises Bank Rate to bring inflation back to target.",
    parts: [
      ["State the inflation target and who sets Bank Rate.", 2, ["2% CPI inflation", "the Monetary Policy Committee"], "The target is 2% CPI inflation, and Bank Rate is set by the Monetary Policy Committee of the Bank of England.", 4, "recall the UK monetary framework"],
      ["Explain two ways a higher Bank Rate reduces aggregate demand.", 2, ["borrowing costs rise so consumption and investment fall", "the pound appreciates so net exports fall"], "Borrowing costs rise and saving pays more, so consumption and investment fall; and the pound tends to appreciate, so net exports fall.", 4, "explain the transmission mechanism"],
    ],
  },
  {
    slug: "bond-yield",
    topic: "monetary-policy",
    kind: "calculation",
    calculator: false,
    stem: "A bond pays a fixed coupon of £5 a year. Its market price rises from £100 to £125.",
    parts: [
      ["Calculate the yield before and after the price rise.", 2, ["5% before", "4% after"], "The yield is £5 ÷ £100 = 5% before and £5 ÷ £125 = 4% after, showing that bond prices and yields move inversely.", 2, "calculate bond yields"],
    ],
  },
  {
    slug: "deficit-debt",
    topic: "fiscal-supply-side",
    stem: "A government spends £1 100 billion in a year and raises £1 000 billion in tax revenue.",
    calculator: false,
    parts: [
      ["State the budget deficit and explain how it differs from the national debt.", 2, ["the deficit is £100 billion for the year", "the national debt is the total accumulated borrowing"], "The deficit is £100 billion for the year, while the national debt is the total accumulated borrowing from all past deficits minus surpluses.", 2, "distinguish deficit and debt"],
    ],
  },
  {
    slug: "regressive-tax",
    topic: "fiscal-supply-side",
    stem: "VAT is charged at 20% on most goods.",
    parts: [
      ["Explain why VAT is often described as regressive.", 2, ["lower-income households spend a larger share of their income", "so VAT takes a larger proportion of their income"], "Lower-income households spend a larger share of their income on taxed goods, so VAT takes a larger proportion of their income even though richer households pay more in total.", 3, "explain regressive taxation"],
    ],
  },
  {
    slug: "comparative-advantage",
    topic: "international-economy",
    stem: "In an hour, country X can make 10 cars or 20 computers, and country Y can make 4 cars or 16 computers.",
    calculator: false,
    parts: [
      ["Identify which country has a comparative advantage in cars and explain using opportunity cost.", 2, ["country X has the comparative advantage in cars", "a car costs X 2 computers but costs Y 4 computers"], "Country X has the comparative advantage in cars because a car costs X 2 computers but costs Y 4 computers, so X gives up less.", 2, "apply comparative advantage"],
    ],
  },
  {
    slug: "depreciation-current-account",
    topic: "international-economy",
    stem: "The pound depreciates sharply against other currencies.",
    parts: [
      ["Explain why the current account may worsen at first before improving.", 3, ["demand for exports and imports is price inelastic in the short run", "the J-curve", "improves when the Marshall–Lerner condition holds"], "Demand for exports and imports is price inelastic in the short run, so import spending rises at first, giving the J-curve; the current account improves later when the Marshall–Lerner condition holds.", 5, "explain the J-curve"],
    ],
  },
];

export const aqaEconomicsQuestions = buildNewSubjectQuestions("aqa-alevel-economics", items);
