export function runSerpentineLottery(context) {
  const {
    state,
    getAllSlots,
    getValidPairMapForChoice,
    buildPassGroups,
    getActivityById,
    getSlotById,
    hasConflict,
    getSharedPairSlotIds,
    sortSlotsByDayAndTime,
    buildResultRow,
    parseRoomNumber
  } = context;

  const runAt = new Date().toISOString();
  const families = state.families.filter(f => f.lotteryNumbers);
  const allSlots = getAllSlots();
  const capacityBySlot = Object.fromEntries(allSlots.map(s => [s.id, s.capacity]));
  const allocationsByFamily = Object.fromEntries(families.map(f => [f.id, []]));
  const winsByFamily = Object.fromEntries(families.map(f => [f.id, 0]));
  const maxWins = Math.max(1, Number(state.config.maxWinsPerFamily) || 2);
  const maxWinsWithOverflow = Math.max(maxWins, 4);

  const rows = [];
  const passDefs = [
    { pass: 1, choiceIndex: 0, choiceKey: "choice1", reverse: false },
    { pass: 2, choiceIndex: 1, choiceKey: "choice2", reverse: true },
    { pass: 3, choiceIndex: 2, choiceKey: "choice3", reverse: false },
    { pass: 4, choiceIndex: 3, choiceKey: "choice4", reverse: true }
  ];
  const familiesWithChoice1 = families.filter(f => f.form?.choices?.[0]?.activityId);
  let firstPassFairnessSatisfied = false;

  function allocateSingle(family, passDef, forcedNumber = null, forcedReasonPrefix = "", winCap = maxWins) {
    if (winsByFamily[family.id] >= winCap) {
      rows.push(buildResultRow({
        runAt,
        status: "waitlist",
        familyId: family.id,
        lastName: family.lastName,
        roomNumber: family.roomNumber,
        activityId: "",
        activityName: "",
        slotId: "",
        slotLabel: "",
        pass: passDef.pass,
        choiceNumber: passDef.choiceIndex + 1,
        lotteryNumber: forcedNumber ?? family.lotteryNumbers?.[passDef.choiceKey] ?? null,
        reason: `${forcedReasonPrefix}Skipped due to max wins cap`
      }));
      return;
    }

    const choice = family.form?.choices?.[passDef.choiceIndex];
    if (!choice?.activityId) return;

    const activity = getActivityById(choice.activityId);
    if (!activity) return;

    const slotIds = choice.slots.filter(Boolean);
    let booked = false;

    for (const slotId of slotIds) {
      const slot = getSlotById(slotId);
      if (!slot || slot.activityId !== activity.id) continue;
      if ((capacityBySlot[slot.id] || 0) <= 0) continue;
      if (hasConflict(allocationsByFamily[family.id], slot)) continue;
      if ((choice.excludedDays || []).includes(slot.day)) continue;

      capacityBySlot[slot.id] -= 1;
      winsByFamily[family.id] += 1;

      const row = buildResultRow({
        runAt,
        status: "allocated",
        familyId: family.id,
        lastName: family.lastName,
        roomNumber: family.roomNumber,
        activityId: activity.id,
        activityName: activity.name,
        slotId: slot.id,
        slotLabel: slot.label,
        pass: passDef.pass,
        choiceNumber: passDef.choiceIndex + 1,
        lotteryNumber: forcedNumber ?? family.lotteryNumbers?.[passDef.choiceKey] ?? null,
        reason: forcedReasonPrefix ? `${forcedReasonPrefix}Soft-link fallback success` : ""
      });

      allocationsByFamily[family.id].push(row);
      rows.push(row);
      booked = true;
      break;
    }

    if (!booked) {
      rows.push(buildResultRow({
        runAt,
        status: "waitlist",
        familyId: family.id,
        lastName: family.lastName,
        roomNumber: family.roomNumber,
        activityId: activity.id,
        activityName: activity.name,
        slotId: "",
        slotLabel: "",
        pass: passDef.pass,
        choiceNumber: passDef.choiceIndex + 1,
        lotteryNumber: forcedNumber ?? family.lotteryNumbers?.[passDef.choiceKey] ?? null,
        reason: `${forcedReasonPrefix}All preferred slots full or conflicted`
      }));
    }
  }

  passDefs.forEach(passDef => {
    const passWinCap = (passDef.pass >= 3 && firstPassFairnessSatisfied) ? maxWinsWithOverflow : maxWins;
    const pairMap = getValidPairMapForChoice(families, passDef.choiceIndex);
    const groups = buildPassGroups(families, pairMap, passDef.choiceKey, passDef.reverse);
    const fallbackSingles = [];

    groups.forEach(group => {
      if (group.type === "single") {
        allocateSingle(group.families[0], passDef, null, "", passWinCap);
        return;
      }

      const [familyA, familyB] = group.families;
      if (winsByFamily[familyA.id] >= passWinCap || winsByFamily[familyB.id] >= passWinCap) {
        allocateSingle(familyA, passDef, familyA.lotteryNumbers?.[passDef.choiceKey] ?? null, "Soft-link fallback: ", passWinCap);
        allocateSingle(familyB, passDef, familyB.lotteryNumbers?.[passDef.choiceKey] ?? null, "Soft-link fallback: ", passWinCap);
        return;
      }

      const choiceA = familyA.form?.choices?.[passDef.choiceIndex];
      const choiceB = familyB.form?.choices?.[passDef.choiceIndex];

      if (!choiceA?.activityId || !choiceB?.activityId || choiceA.activityId !== choiceB.activityId) {
        fallbackSingles.push(familyA, familyB);
        return;
      }

      const activity = getActivityById(choiceA.activityId);
      if (!activity) {
        fallbackSingles.push(familyA, familyB);
        return;
      }

      const sharedSlots = getSharedPairSlotIds(choiceA, choiceB);
      let placedPair = false;

      for (const slotId of sharedSlots) {
        const slot = getSlotById(slotId);
        if (!slot || slot.activityId !== activity.id) continue;
        if ((capacityBySlot[slot.id] || 0) < 2) continue;
        if (hasConflict(allocationsByFamily[familyA.id], slot)) continue;
        if (hasConflict(allocationsByFamily[familyB.id], slot)) continue;

        capacityBySlot[slot.id] -= 2;
        winsByFamily[familyA.id] += 1;
        winsByFamily[familyB.id] += 1;

        const rowA = buildResultRow({
          runAt,
          status: "allocated",
          familyId: familyA.id,
          lastName: familyA.lastName,
          roomNumber: familyA.roomNumber,
          activityId: activity.id,
          activityName: activity.name,
          slotId: slot.id,
          slotLabel: slot.label,
          pass: passDef.pass,
          choiceNumber: passDef.choiceIndex + 1,
          lotteryNumber: group.effectiveNumber,
          pairedWithFamilyId: familyB.id
        });

        const rowB = buildResultRow({
          runAt,
          status: "allocated",
          familyId: familyB.id,
          lastName: familyB.lastName,
          roomNumber: familyB.roomNumber,
          activityId: activity.id,
          activityName: activity.name,
          slotId: slot.id,
          slotLabel: slot.label,
          pass: passDef.pass,
          choiceNumber: passDef.choiceIndex + 1,
          lotteryNumber: group.effectiveNumber,
          pairedWithFamilyId: familyA.id
        });

        allocationsByFamily[familyA.id].push(rowA);
        allocationsByFamily[familyB.id].push(rowB);
        rows.push(rowA, rowB);
        placedPair = true;
        break;
      }

      if (!placedPair) {
        fallbackSingles.push(familyA, familyB);
      }
    });

    fallbackSingles
      .filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i)
      .sort((a, b) => {
        const na = a.lotteryNumbers?.[passDef.choiceKey] ?? Number.MAX_SAFE_INTEGER;
        const nb = b.lotteryNumbers?.[passDef.choiceKey] ?? Number.MAX_SAFE_INTEGER;
        if (na !== nb) return passDef.reverse ? nb - na : na - nb;
        return parseRoomNumber(a.roomNumber) - parseRoomNumber(b.roomNumber);
      })
      .forEach(f => allocateSingle(f, passDef, f.lotteryNumbers?.[passDef.choiceKey] ?? null, "Soft-link fallback: ", passWinCap));

    if (passDef.pass === 1) {
      firstPassFairnessSatisfied = familiesWithChoice1.every(family =>
        rows.some(r => r.familyId === family.id && r.pass === 1)
      );
    }
  });

  const catchAllCandidates = families
    .filter(f => (f.form?.choices || []).some(choice => choice.anyAvailable && choice.activityId))
    .sort((a, b) => (a.lotteryNumbers.choice1 ?? 9999) - (b.lotteryNumbers.choice1 ?? 9999));

  catchAllCandidates.forEach(family => {
    if (winsByFamily[family.id] >= maxWins) return;
    if (allocationsByFamily[family.id].length > 0) return;

    let slot = null;
    for (const choice of (family.form?.choices || []).filter(entry => entry.anyAvailable && entry.activityId)) {
      const activity = getActivityById(choice.activityId);
      if (!activity) continue;
      slot = activity.slots
        .slice()
        .sort(sortSlotsByDayAndTime)
        .find(s => {
          if ((capacityBySlot[s.id] || 0) <= 0) return false;
          if (hasConflict(allocationsByFamily[family.id], s)) return false;
          if ((choice.excludedDays || []).includes(s.day)) return false;
          return true;
        });
      if (slot) break;
    }

    if (!slot) return;

    capacityBySlot[slot.id] -= 1;
    winsByFamily[family.id] += 1;

    const row = buildResultRow({
      runAt,
      status: "catchall",
      familyId: family.id,
      lastName: family.lastName,
      roomNumber: family.roomNumber,
      activityId: slot.activityId,
      activityName: slot.activityName,
      slotId: slot.id,
      slotLabel: slot.label,
      pass: "catch-all",
      choiceNumber: null,
      lotteryNumber: family.lotteryNumbers.choice1 ?? null
    });

    allocationsByFamily[family.id].push(row);
    rows.push(row);
  });

  return { rows, runAt };
}
