$(function() {
  $(".follow").click(function(e) {
    var makeFollow = ($(e.currentTarget).text() === 'Follow');
    $.post("/follow/" + $(".username").val(), {
      _csrf: $(".csrf").val(),
      makeFollow: makeFollow
    }, function(response) {
      if (response.status && response.status === 'success') {
        if (makeFollow) {
          $(e.currentTarget).removeClass("btn-success")
            .addClass("btn-danger")
            .text("Unfollow");
        } else {
          $(e.currentTarget).removeClass("btn-danger")
            .addClass("btn-success")
            .text("Follow");
        }
      } else {
        alert("An error occurred");
      }
    });
  });
});
