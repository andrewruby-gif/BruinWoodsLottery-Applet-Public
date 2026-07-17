export function bootstrapApp(context) {
  const {
    els,
    handleGuestDraw,
    clearGuestForm,
    setSidebarCollapsed,
    switchView,
    setActiveTab,
    closeEntryModal,
    saveEntryModal,
    handleModalEnterNavigation,
    closeEditFamilyModal,
    saveEditFamilyModal,
    loadDemoGuests,
    resetApp,
    exportData,
    importDataPrompt,
    handleImportFile,
    discardResults,
    updateSidebarLayout,
    render,
    loadSidebarPreference
  } = context;

  els.drawBtn.addEventListener("click", handleGuestDraw);
  els.clearNextBtn.addEventListener("click", clearGuestForm);
  els.sidebarToggleBtn.addEventListener("click", () => setSidebarCollapsed(!context.getIsSidebarCollapsed()));
  els.sidebarHamburgerBtn.addEventListener("click", () => setSidebarCollapsed(!context.getIsSidebarCollapsed()));
  els.showGuestBtn.addEventListener("click", () => switchView(false));
  els.showStaffBtn.addEventListener("click", () => switchView(true));
  // Tab button clicks are handled by a delegated listener in the non-module
  // script (window.switchToTab), so no per-button wiring is needed here.
  els.closeModalBtn.addEventListener("click", closeEntryModal);
  els.saveModalBtn.addEventListener("click", saveEntryModal);
  els.entryModal.addEventListener("click", e => {
    if (e.target === els.entryModal) closeEntryModal();
  });
  els.entryModal.addEventListener("keydown", handleModalEnterNavigation);

  els.closeEditFamilyModalBtn.addEventListener("click", closeEditFamilyModal);
  els.saveEditFamilyBtn.addEventListener("click", saveEditFamilyModal);
  els.editFamilyModal.addEventListener("click", e => {
    if (e.target === els.editFamilyModal) closeEditFamilyModal();
  });
  els.editFamilyModal.addEventListener("keydown", e => {
    if (e.key === "Escape") closeEditFamilyModal();
  });

  els.loadDemoBtn.addEventListener("click", loadDemoGuests);
  els.resetBtn.addEventListener("click", resetApp);
  els.exportBackupBtn.addEventListener("click", exportData);
  els.importBackupBtn.addEventListener("click", importDataPrompt);
  els.backupFileInput.addEventListener("change", handleImportFile);
  els.discardResultsBtn?.addEventListener("click", discardResults);
  window.addEventListener("resize", updateSidebarLayout);

  function init() {
    render();
    setSidebarCollapsed(loadSidebarPreference());
    clearGuestForm();
    setActiveTab("config");
  }

  init();
}
