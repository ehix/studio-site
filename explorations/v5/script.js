/* ===========================================================================
   v5 — SUBSTRATE

   One interaction: move the upper sheet.

   The ground here is two documents rather than one, and the two are the same
   paper from different batches — warm against cool. That small disagreement
   is what makes a layered ground read as accumulated rather than constructed,
   and it is almost always missing when the layers are built from one source.
   You cannot see it while one sheet covers the other, so the sheet moves.

   Two things make this material rather than a slide-out panel. There is no
   shadow: the upper sheet is legible as being on top purely from overlap
   order and one step of value, which is what flat even illumination actually
   looks like. And the tear stays with the sheet — the pale fibre lip is the
   inside of the paper, so it travels with the edge it belongs to and is the
   brightest thing on the page wherever it goes.
   =========================================================================== */

(function () {
  "use strict";

  var over  = document.getElementById("over");
  var grip  = document.getElementById("grip");
  var plate = document.getElementById("plate");
  if (!over || !grip || !plate) return;

  var offset  = 0;
  var start   = 0;
  var from    = 0;
  var dragging = false;

  /* The sheet travels LEFT, into the reserved ground beside the plate. That
     field is empty on purpose, so the sheet has somewhere to go without
     running off the page — and the torn edge leads, which is the edge worth
     watching. Travel stops once the sheet beneath is readable: it is a sheet
     on a plate, not a drawer. */
  function limit() {
    return plate.getBoundingClientRect().width * 0.78;
  }

  function apply() {
    over.style.transform = "translateX(" + offset.toFixed(1) + "px)";
  }

  function set(next) {
    offset = Math.min(0, Math.max(-limit(), next));
    apply();
  }

  /* --- drag ---------------------------------------------------------------- */

  function down(e) {
    /* the grip is its own control: capturing the pointer here would retarget
       the click away from it and the button would never fire */
    if (e.target.closest(".over__grip")) return;
    dragging = true;
    start = e.clientX;
    from  = offset;
    over.setPointerCapture(e.pointerId);
    over.style.transition = "none";
  }

  function move(e) {
    if (!dragging) return;
    set(from + (e.clientX - start));
  }

  function up(e) {
    if (!dragging) return;
    dragging = false;
    if (over.hasPointerCapture(e.pointerId)) over.releasePointerCapture(e.pointerId);
    over.style.transition = "";
  }

  over.addEventListener("pointerdown", down);
  over.addEventListener("pointermove", move);
  over.addEventListener("pointerup", up);
  over.addEventListener("pointercancel", up);

  /* --- the grip -----------------------------------------------------------
     A click moves the sheet the whole way and back, so the interaction is
     available without a drag. Arrow keys nudge it. */

  grip.addEventListener("click", function (e) {
    e.stopPropagation();
    over.style.transition = "transform 260ms cubic-bezier(0.2, 0, 0, 1)";
    set(offset < -limit() / 2 ? 0 : -limit());
  });

  grip.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft")  { e.preventDefault(); over.style.transition = "none"; set(offset - 24); }
    if (e.key === "ArrowRight") { e.preventDefault(); over.style.transition = "none"; set(offset + 24); }
  });

  /* keep the sheet inside the plate when the plate changes size */
  addEventListener("resize", function () { set(offset); });

  apply();
})();
