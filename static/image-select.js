$(function() {
  $(".savedphotos .pcon").click(function(e) {
    if ($(e.currentTarget).hasClass("picked")) {
      // already picked, removing it
      $(e.currentTarget).removeClass("picked")
        .find("button").hide();
      updatePickCount();
      $.post("/pick", {
        id: $(e.currentTarget).find("img").attr("id"),
        _csrf: $(".csrf").val(),
        makePick: false
      }, function(response) {
        if (response.status && response.status === 'success') {
          $(e.currentTarget).find("button").html("Pick &check;").show();
        } else {
          alert("An error occurred");
        }
      });
    } else if ($(e.currentTarget).hasClass("maybe-pick")) {
      // confirmed
      $(e.currentTarget).removeClass("maybe-pick")
        .addClass("picked")
        .find("button").hide();
      updatePickCount();
      $.post("/pick", {
        id: $(e.currentTarget).find("img").attr("id"),
        _csrf: $(".csrf").val(),
        makePick: true
      }, function(response) {
        if (response.status && response.status === 'success') {
          $(e.currentTarget).find("button").text("Remove x").show();
        } else {
          alert("An error occurred");
        }
      });
    } else {
      // click again to confirm
      $(".savedphotos .pcon").removeClass("maybe-pick");
      $(e.currentTarget).addClass("maybe-pick");
    }
  });

  function updatePickCount() {
    var count = $(".picked").length;
    if ((count && count <= 8) || $(".unpublish").length) {
      $(".postnow").show();
    } else {
      $(".postnow").hide();
    }
    $(".pickcount").text(count);
  }

  $(".postnow button").click(function(e) {
    $.post("/publish", {
      _csrf: $(".csrf").val(),
      makePublish: !($(e.currentTarget).hasClass("unpublish"))
    }, function (response) {
      if (response.status && response.status === 'success') {
        window.location.reload();
      } else {
        alert("An error occurred");
      }
    });
  });

  updatePickCount();
});
