(function() {
  var nikForm = document.getElementById('nikForm');
  if (nikForm) {
    nikForm.addEventListener('submit', function() {
      var nik = document.getElementById('input_nik');
      if (nik) sessionStorage.setItem('nik', nik.value);
    });
  }
})();
