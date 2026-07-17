export function validatePreRunState(context) {
  const {
    state,
    CHOICE_KEYS,
    CHOICE_RANGES,
    dayOrder,
    getAllSlots,
    getActivities,
    roomNorm,
    findFamilyByRoom
  } = context;

  const issues = [];
  const warnings = [];
  const families = state.families || [];
  const byRoom = new Map();
  const allSlots = getAllSlots();
  const slotById = new Map(allSlots.map(slot => [slot.id, slot]));
  const activitiesById = new Map(getActivities().map(activity => [activity.id, activity]));

  const addIssue = (message) => issues.push(message);
  const addWarning = (message) => warnings.push(message);

  if ((Number(state.config.expectedFamilies) || 0) < families.length) {
    addIssue(`Expected families (${state.config.expectedFamilies}) is lower than checked in families (${families.length}).`);
  }

  if ((Number(state.config.maxWinsPerFamily) || 0) < 1) {
    addIssue("Max wins per family must be at least 1.");
  }

  allSlots.forEach(slot => {
    const cap = Number(slot.capacity);
    if (!Number.isFinite(cap) || cap < 0) {
      addIssue(`Slot ${slot.label} has invalid capacity (${slot.capacity}).`);
    }
  });

  const seenLotteryNumbers = {
    choice1: new Map(),
    choice2: new Map(),
    choice3: new Map(),
    choice4: new Map()
  };

  families.forEach(family => {
    const room = roomNorm(family.roomNumber);
    if (!room) {
      addIssue(`${family.lastName || "Unknown family"} is missing a room number.`);
    } else if (byRoom.has(room)) {
      const firstFamily = byRoom.get(room);
      addIssue(`Duplicate room number ${family.roomNumber} for ${firstFamily.lastName} and ${family.lastName}.`);
    } else {
      byRoom.set(room, family);
    }

    CHOICE_KEYS.forEach((choiceKey, idx) => {
      const number = family.lotteryNumbers?.[choiceKey];
      if (!Number.isFinite(number)) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) is missing ${choiceKey} lottery number.`);
        return;
      }

      const range = CHOICE_RANGES[choiceKey];
      if (number < range.min || number > range.max) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) has ${choiceKey} number ${number} outside ${range.min}-${range.max}.`);
      }

      const keyMap = seenLotteryNumbers[choiceKey];
      if (keyMap.has(number)) {
        const otherFamily = keyMap.get(number);
        addIssue(`${choiceKey} lottery number ${number} is duplicated by ${otherFamily.lastName} and ${family.lastName}.`);
      } else {
        keyMap.set(number, family);
      }

      const choice = family.form?.choices?.[idx];
      if (!choice || !choice.activityId) return;

      const activity = activitiesById.get(choice.activityId);
      if (!activity) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) has an unknown activity in Choice ${idx + 1}.`);
        return;
      }

      const selectedSlotIds = Array.isArray(choice.slots) ? choice.slots.filter(Boolean) : [];
      const hasAnyFallback = Boolean(choice.anyAvailable);
      if (!selectedSlotIds.length && !hasAnyFallback) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} has no slots and no any-slot fallback.`);
      }

      const selectedSet = new Set();
      selectedSlotIds.forEach(slotId => {
        if (selectedSet.has(slotId)) {
          addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} repeats slot ${slotId}.`);
          return;
        }
        selectedSet.add(slotId);

        const slot = slotById.get(slotId);
        if (!slot) {
          addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} references missing slot ${slotId}.`);
          return;
        }
        if (slot.activityId !== activity.id) {
          addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} includes slot ${slot.label} from a different activity.`);
        }
      });

      const excludedDays = Array.isArray(choice.excludedDays) ? choice.excludedDays : [];
      excludedDays.forEach(day => {
        if (!dayOrder.includes(day)) {
          addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} has invalid excluded day ${day}.`);
        }
      });

      const pairRoom = String(choice.pairRoomNumber || "").trim();
      if (!pairRoom) return;

      const buddy = byRoom.get(roomNorm(pairRoom)) || findFamilyByRoom(pairRoom);
      if (!buddy) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} pairs with unknown room ${pairRoom}.`);
        return;
      }

      if (buddy.id === family.id) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} cannot pair with itself.`);
        return;
      }

      const buddyChoice = buddy.form?.choices?.[idx];
      const buddyPairRoom = String(buddyChoice?.pairRoomNumber || "").trim();
      if (roomNorm(buddyPairRoom) !== roomNorm(family.roomNumber)) {
        addIssue(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} pairing with Room ${pairRoom} is not reciprocal.`);
      }

      if (buddyChoice?.activityId && choice.activityId !== buddyChoice.activityId) {
        addWarning(`${family.lastName} (Room ${family.roomNumber}) Choice ${idx + 1} pair has different activities and will soft-fallback.`);
      }
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    warnings
  };
}

export function computeDiagnostics(context) {
  const {
    rows,
    activeRows,
    waitlistRows,
    openCap,
    state,
    getActivities
  } = context;

  const families = state.families || [];
  const familiesWithChoice1 = families.filter(f => Boolean(f.form?.choices?.[0]?.activityId));
  const firstChoiceWinnerIds = new Set(
    activeRows
      .filter(row => Number(row.choiceNumber) === 1)
      .map(row => row.familyId)
  );

  const activeWinsByFamily = activeRows.reduce((acc, row) => {
    const current = acc.get(row.familyId) || 0;
    acc.set(row.familyId, current + 1);
    return acc;
  }, new Map());

  const winBuckets = { 0: 0, 1: 0, 2: 0, "3+": 0 };
  families.forEach(family => {
    const wins = activeWinsByFamily.get(family.id) || 0;
    if (wins >= 3) {
      winBuckets["3+"] += 1;
    } else {
      winBuckets[wins] += 1;
    }
  });

  const waitlistByActivity = waitlistRows.reduce((acc, row) => {
    const key = row.activityName || "Unknown";
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const waitlistByPass = waitlistRows.reduce((acc, row) => {
    const key = `P${row.pass}`;
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const activities = getActivities();
  const activitySeatStats = activities.map(activity => {
    const totalSeats = activity.slots.reduce((sum, slot) => sum + (Number(slot.capacity) || 0), 0);
    const openSeats = activity.slots.reduce((sum, slot) => sum + Math.max(0, openCap[slot.id] || 0), 0);
    const usedSeats = Math.max(0, totalSeats - openSeats);
    const utilization = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;
    return {
      activityName: activity.name,
      totalSeats,
      usedSeats,
      openSeats,
      utilization
    };
  });

  const overrideRows = rows.filter(row => Boolean(row.overrideBy || row.overrideAt));
  const dropCount = rows.filter(row => row.status === "dropped").length;
  const manualCount = rows.filter(row => row.status === "manual").length;

  return {
    firstChoiceEligible: familiesWithChoice1.length,
    firstChoiceWinners: firstChoiceWinnerIds.size,
    winBuckets,
    waitlistByActivity,
    waitlistByPass,
    activitySeatStats,
    overrideCount: overrideRows.length,
    dropCount,
    manualCount
  };
}
