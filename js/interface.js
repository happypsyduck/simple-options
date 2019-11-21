// Code that runs the client side based Simple Options

var detectMetamask = false; // Default value is that metamask is not on the system
var metamaskConnected = false;
var userAddress = "";
var contractAddress = "0xAa63e1eB4CbbdDD85C516996BF64159B75E4023B";
var refreshTime = 0;
var roundTransition = false;
var deadlineTime = 0;
var topRound = 0; // The highest round number
var currentRound = 0;

var targetNetwork = "1";

// Contract function keccak hashes
var contract_buyCall = "8e0f0d61";
var contract_buyPut = "e8651aa0";
var contract_getCurrentRound = "8a19c8bc";
var contract_startNewRound = "bd85948c";
var contract_getTicketCost = "6b817337";
var contract_getRoundInfo = "cb989f64"; // Requires uint
var contract_getUserInfo = "a754ecb0"; // Requires uint and address
var contract_withdraw = "155dd5ee"; // Requires uint for round
var contract_addFunds = "cb899a28";

$(document).ready(function() {
  // This is ran when the page has fully loaded
  checkMetaMaskExist();
  $("#contract_link").html(contractAddress);
  $("#contract_link").attr("href", "https://etherscan.io/address/" + contractAddress);
});

function checkMetaMaskExist() {
  // This function checks if MetaMask is installed or not on the browser
  if (typeof window.ethereum !== 'undefined') {
    // Web3 exists, detect if metamask
    if (ethereum.isMetaMask == true) {
      detectMetamask = true;
      $("#metamask_interactive").html("Connect MetaMask");
    }
  }
}

function metamaskButtonClick() {
  // Based on whether metamask is available or not, the button click will vary
  if (detectMetamask == false) {
    var win = window.open('https://metamask.io/', '_blank');
  } else if (detectMetamask == true && metamaskConnected == false) {
    // Try to connect to MetaMask
    ethereum.enable()
      // Remember to handle the case they reject the request:
      .catch(function(reason) {
        console.log(reason);
      })
      .then(function(accounts) {
        if (ethereum.networkVersion !== targetNetwork) {
          // Not equal to the mainnet, let user know to switch
          alert('This application requires the main network, please switch it in your MetaMask UI.')
          return;
        }
        userAddress = accounts[0]; // We have an account now (ETH address)
        metamaskConnected = true;
        transitionRoundInformation(topRound);
        $("#metamask_interactive").html("MetaMask Connected");
        ethereum.on('accountsChanged', function(accounts) {
          userAddress = accounts[0]; // Update the userAddress when the account changes
        })
      })
  }
}

function padleftzero(str, max) {
  str = str.toString();
  return str.length < max ? padleftzero("0" + str, max) : str;
}

function padrightzero(str, max) {
  str = str.toString();
  return str.length < max ? padrightzero(str + "0", max) : str;
}

function transitionRoundInformation(targetRound) {
  roundTransition = true;
  // This function transitions round screens
  if (targetRound == 0) {
    // No round selected yet, go to the latest round
    $("#preview_div").fadeOut(400, function() {
      // Once the fadeOut has completed, load the current round
      const callParameters = [{
        to: contractAddress,
        data: '0x' + contract_getCurrentRound
      }, "latest"];

      //Get data from blockchain
      ethereum.sendAsync({
        method: 'eth_call',
        params: callParameters,
        id: "1",
        jsonrpc: "2.0"
      }, function(err, result) {
        if (!err) {
          if (!result["error"]) {

            var return_data = result["result"].substring(2); // Remove the 0x

            // Obtain the current round number
            var roundNum = new BigNumber('0x' + return_data.substring(0, 64));

            if (roundNum == 0) {
              alert("No current rounds are set yet for this contract");
              return;
            }

            topRound = parseInt(roundNum);
            currentRound = topRound;

            // Update round headers
            if (topRound > 1) {
              $("#last_round_span").show();
            } else {
              $("#last_round_span").hide(); // This is the first round
            }

            $("#next_round_span").hide(); // We are at the top round, hide the next symbol
            $("#round_text").html("Current Round"); // This is our current round

            $("#call_ticket_container").hide();
            $("#put_ticket_container").hide();
            $("#game_div").css("min-height", "850px"); // Change the minimum height

            // Now query the market information
            getMarketInformation();

            // Next get ticket price
            getTicketCost();

            // Now finally get the user information for the round
            getUserInfo(false);

            // Start the timer
            window.setTimeout(refreshRoundInformation, 1000);

          } else {
            console.log("RPC error: " + result["error"]);
          }
        }
      });

    });
  } else {
    // We are moving to different rounds
    // Fade out the game window
    $("#game_data").fadeOut(400, function() {
      // Once the fadeOut has completed, Update the round headers
      if (targetRound == topRound) {
        // This is our top round
        $("#round_text").html("Current Round"); // This is our current round
        $("#next_round_span").hide(); // This is the final round
      } else {
        $("#round_text").html("Round " + targetRound);
        $("#next_round_span").show(); // This is not the top round
      }

      if (targetRound > 1) {
        $("#last_round_span").show();
      } else {
        $("#last_round_span").hide(); // This is the first round
      }

      // Also hide the ticket windows
      $("#call_ticket_container").hide();
      $("#put_ticket_container").hide();

      // Now query the game information
      currentRound = targetRound;
      getMarketInformation();
      getTicketCost();
      getUserInfo(false);
    });
  }
}

function getMarketInformation() {
  // Grabs market information for the current round, and if hidden, will show the game data
  if (currentRound < 1 || currentRound > topRound) {
    return;
  }
  var roundBigNum = new BigNumber(currentRound);
  var roundHex = padleftzero(roundBigNum.toString(16), 64); // Convert this number to base 16 (hex) and pad to 64 chars

  const callParameters = [{
    to: contractAddress,
    data: '0x' + contract_getRoundInfo + roundHex
  }, "latest"];

  //Get round data from blockchain
  ethereum.sendAsync({
    method: 'eth_call',
    params: callParameters,
    id: "2",
    jsonrpc: "2.0"
  }, function(err, result) {
    if (!err) {
      if (!result["error"]) {
        var return_data = result["result"].substring(2); // Remove the 0x
        if (return_data.length < 2) {
          // This is an anomaly, should not happen
          console.log("Error fetching blockchain data, request data: 0x" + contract_getRoundInfo + roundHex + ", return data: 0x" + return_data);
          window.setTimeout(function() {
            getMarketInformation();
          }, 3000); // Retry the call in 3 seconds
          return;
        }

        // Obtain round information
        // startPriceWei (uint256), endPriceWei (uint256), startTime (uint256), endTime (uint256), totalCallPotWei (uint256), totalPutPotWei (uint256), totalcalltickets (uint256), totalputticket (uint256),
        // roundstatus (uint256), potsize (uint256)
        var start_price_wei = new BigNumber('0x' + return_data.substring(0, 64));
        var end_price_wei = new BigNumber('0x' + return_data.substring(64, 64 * 2));
        var start_time = new BigNumber('0x' + return_data.substring(64 * 2, 64 * 3));
        var end_time = new BigNumber('0x' + return_data.substring(64 * 3, 64 * 4));
        var total_call_wei = new BigNumber('0x' + return_data.substring(64 * 4, 64 * 5));
        var total_put_wei = new BigNumber('0x' + return_data.substring(64 * 5, 64 * 6));
        var total_call_tickets = new BigNumber('0x' + return_data.substring(64 * 6, 64 * 7));
        var total_put_tickets = new BigNumber('0x' + return_data.substring(64 * 7, 64 * 8));
        var round_status = new BigNumber('0x' + return_data.substring(64 * 8, 64 * 9));
        var house_pot_wei = new BigNumber('0x' + return_data.substring(64 * 9, 64 * 10));

        // Dividing factor
        var divfactor = new BigNumber('1000000000000000000'); // Divide factor to get ETH

        // Convert to ETH units
        var start_price = start_price_wei.div(divfactor);
        var end_price = end_price_wei.div(divfactor);
        var total_call = total_call_wei.div(divfactor);
        var total_put = total_put_wei.div(divfactor);
        var house_pot = house_pot_wei.div(divfactor);

        // Now fill in the areas
        if (round_status == 0) {
          // This is an ongoing round
          var start_date = new Date(parseInt(start_time) * 1000).toUTCString().replace("GMT", "UTC");
          deadlineTime = parseInt(end_time);
          $("#header_div").html('Will the price of Ethereum be higher or lower in 1 hour?<br><span style="font-size: 16px;">Start Time: <span id="time_date_span">' + start_date + '</span></span>');
          $("#price_div").html("$" + start_price.toFixed(2).toString(10));
          $("#countdown_sub").show();

          adjustCountDown();

          $("#data_refresh").show();

        } else {
          // The round has ended
          $("#header_div").html('<span style="font-size: 16px;">Starting Price</span><br><big><strong>$' + start_price.toFixed(2).toString(10) + "</strong></big>");
          $("#price_div").html("$" + end_price.toFixed(2).toString(10));
          disableBuyOptions();
          $("#countdown_sub").hide();
          $("#data_refresh").hide();
          $("#house_pot_description").html("House Pot");

          if (round_status == 1) {
            // Round has been closed out, there is a winner
            if (end_price.comparedTo(start_price) > 0) {
              // Callers won
              $("#countdown").html("Price Increased<br>Calls Won")
              $("#countdown").css("color", "rgb(100,150,0)");

              // Calculate payout percent
              var payout_percent = new BigNumber(1).minus(total_call_tickets.div(total_call_tickets.plus(total_put_tickets)));
              payout_percent = payout_percent.multipliedBy(80).plus(10).dp(2);
              $("#house_pot_description").html("Payout: " + payout_percent + "%");

            } else {
              $("#countdown").html("Price Decreased<br>Puts Won")
              $("#countdown").css("color", "rgb(213,13,3)");

              // Calculate payout percent
              var payout_percent = new BigNumber(1).minus(total_put_tickets.div(total_call_tickets.plus(total_put_tickets)));
              payout_percent = payout_percent.multipliedBy(80).plus(10).dp(2);
              $("#house_pot_description").html("Payout: " + payout_percent + "%");
            }

          } else if (round_status == 2) {
            // Round was closed too late, price is stale
            $("#countdown").html("No Contest<br>Stale Price")
            $("#countdown").css("color", "rgb(50,50,50)");
          } else if (round_status == 3) {
            // Round was closed due to lack of participants or no price change
            $("#countdown").html("No Contest")
            $("#countdown").css("color", "rgb(50,50,50)");
          }
        }

        $("#call_pot").html(total_call.toString(10));
        $("#put_pot").html(total_put.toString(10));
        $("#total_call_tickets").html(total_call_tickets.toString(10));
        $("#total_put_tickets").html(total_put_tickets.toString(10));
        $("#house_pot").html(house_pot.dp(6).toString(10)); // Round to 6 decimal places

        if ($("#game_data").css("display").toLowerCase() == "none") {
          // The display is not visible, show it
          $("#game_data").fadeIn();
        }

        if (roundTransition == true) {
          refreshTime = 10;
          roundTransition = false;
        }

      } else {
        console.log("RPC error: " + result["error"]);
      }
    }
  });
}

function getTopRound() {
  var callParameters = [{
    to: contractAddress,
    data: '0x' + contract_getCurrentRound
  }, "latest"];

  // Get data from blockchain
  ethereum.sendAsync({
    method: 'eth_call',
    params: callParameters,
    id: "3",
    jsonrpc: "2.0"
  }, function(err, result) {
    if (!err) {
      if (!result["error"]) {
        var return_data = result["result"].substring(2); // Remove the 0x
        if (return_data.length < 2) {
          // This is an anomaly, should not happen
          console.log("Error fetching blockchain data, request data: 0x" + contract_getCurrentRound + ", return data: 0x" + return_data);
          window.setTimeout(function() {
            getTopRound();
          }, 3000); // Retry the call in 3 seconds
          return;
        }

        // Obtain the current round number
        var roundNum = new BigNumber('0x' + return_data.substring(0, 64));

        if (topRound == currentRound) {
          if (roundNum.comparedTo(topRound) > 0) {
            // We were the topRound, now we are not
            $("#next_round_span").fadeIn();
            $("#round_text").html("Round " + currentRound);
          }
        }

        topRound = parseInt(roundNum);

      } else {
        console.log("RPC error: " + result["error"]);
      }
    }
  });
}

function getUserInfo(callRefresh) {
  var formatted_userAddress = padleftzero(userAddress.substring(2), 64).toLowerCase();
  var roundBigNum = new BigNumber(currentRound);
  var roundHex = padleftzero(roundBigNum.toString(16), 64); // Convert this number to base 16 (hex) and pad to 64 chars

  callParameters = [{
    to: contractAddress,
    data: '0x' + contract_getUserInfo + roundHex + formatted_userAddress
  }, "latest"];

  // Get data from blockchain
  ethereum.sendAsync({
    method: 'eth_call',
    params: callParameters,
    id: "4",
    jsonrpc: "2.0"
  }, function(err, result) {
    if (!err) {
      if (!result["error"]) {
        var return_data = result["result"].substring(2); // Remove the 0x
        if (return_data.length < 2) {
          // This is an anomaly, should not happen
          console.log("Error fetching blockchain data, request data: 0x" + contract_getUserInfo + roundHex + formatted_userAddress + ", return data: 0x" + return_data);
          window.setTimeout(function() {
            getUserInfo(callRefresh);
          }, 3000); // Retry the call in 3 seconds
          return;
        }

        // Obtain the current round number
        //_user.numCallTickets, _user.numPutTickets, balance
        // num_call_ticket (uint256), num_put_tickets (uint256), balance_wei (uint256)
        var num_call_tickets = new BigNumber('0x' + return_data.substring(0, 64));
        var num_put_tickets = new BigNumber('0x' + return_data.substring(64, 64 * 2));
        var balance_wei = new BigNumber('0x' + return_data.substring(64 * 2, 64 * 3));

        // Dividing factor
        var divfactor = new BigNumber('1000000000000000000'); // Divide factor to get ETH

        // Convert to ETH units
        var balance = balance_wei.div(divfactor);

        $("#my_balance").html(balance.toString(10));
        $("#my_call_tickets").html(num_call_tickets.toString(10));
        $("#my_put_tickets").html(num_put_tickets.toString(10));

        // Now calculate the percentage
        var total_call = new BigNumber($("#total_call_tickets").html());
        var total_put = new BigNumber($("#total_put_tickets").html());
        var total_call_percentage = new BigNumber(0);
        var total_put_percentage = new BigNumber(0);

        if (total_call > 0) {
          total_call_percentage = num_call_tickets.div(total_call).times(100).dp(2);
        }
        if (total_put > 0) {
          total_put_percentage = num_put_tickets.div(total_put).times(100).dp(2);
        }

        $("#my_call_percentage").html("(" + total_call_percentage.toString(10) + "%)");
        $("#my_put_percentage").html("(" + total_put_percentage.toString(10) + "%)");
        $("#withdraw_div").hide();

        if (currentRound < topRound) {
          if (balance > 0) {
            // Round has ended and I have a balance I can withdraw
            $("#withdraw_div").show();
          }
        }

        if (callRefresh == true) {
          // Now refresh round again
          window.setTimeout(refreshRoundInformation, 1000);
        }

      } else {
        console.log("RPC error: " + result["error"]);
      }
    }
  });
}

function getTicketCost() {
  // Convert the current time in seconds to hex
  // First make sure the ticket div is still visible
  if ($("#ticket_div").css("display").toLowerCase() == "none") {
    return;
  }

  callParameters = [{
    to: contractAddress,
    data: '0x' + contract_getTicketCost
  }, "latest"];

  // Get data from blockchain
  ethereum.sendAsync({
    method: 'eth_call',
    params: callParameters,
    id: "5",
    jsonrpc: "2.0"
  }, function(err, result) {
    if (!err) {
      if (!result["error"]) {
        var return_data = result["result"].substring(2); // Remove the 0x
        if (return_data.length < 2) {
          // This is an anomaly, should not happen
          console.log("Error fetching blockchain data, request data: 0x" + contract_getTicketCost + timeHex + ", return data: 0x" + return_data);
          window.setTimeout(function() {
            getTicketCost();
          }, 3000); // Retry the call in 3 seconds
          return;
        }

        // Obtain the current round number
        var ticket_cost_wei = new BigNumber('0x' + return_data.substring(0, 64));

        // Dividing factor
        var divfactor = new BigNumber('1000000000000000000'); // Divide factor to get ETH

        // Convert to ETH units
        var ticket_cost = ticket_cost_wei.div(divfactor);

        $("#ticket_cost").html(ticket_cost.toString(10));
      } else {
        console.log("RPC error: " + result["error"]);
      }
    }
  });
}

function refreshRoundInformation() {
  var skip = false;
  if (roundTransition == true) {
    skip = true;
  }
  if (topRound == 0) {
    skip = true;
  }
  if (ethereum.networkVersion !== targetNetwork) {
    skip = true;
  }

  if (skip == false) {

    $("#data_refresh").html("Data refresh in: " + refreshTime + " seconds");
    refreshTime = refreshTime - 1;
    if (refreshTime <= 0) {
      // Time to refresh, query the blockchain
      refreshTime = 10; // The default refresh rate is every 10 seconds

      // First check the top Round
      getTopRound();

      // Next get the market data
      getMarketInformation();

      // Next get ticket price
      getTicketCost();

      // Now finally get the user information for the round
      getUserInfo(true);

    } else {
      adjustCountDown();
      window.setTimeout(refreshRoundInformation, 1000); // Just run again in 1 second
    }
  } else {
    window.setTimeout(refreshRoundInformation, 1000); // Just run again in 1 second
  }
}

function adjustCountDown() {
  if (deadlineTime == 0) {
    return;
  } // Time has expired
  if (currentRound != topRound) {
    return;
  } // Countdown only applies to current round
  var current_time = Math.floor((new Date).getTime() / 1000); // Get the current time in seconds
  var countdownTime = deadlineTime - current_time;
  if (countdownTime < 0) {
    if (countdownTime < -60) {
      enableCloseOption();
      return;
    }
    countdownTime = 0;
  }

  var hours = Math.floor(countdownTime / (60 * 60));
  var minutes = Math.floor((countdownTime % (60 * 60)) / (60));
  var seconds = Math.floor(countdownTime % 60);

  $("#countdown").html(padleftzero(hours, 2) + ":" + padleftzero(minutes, 2) + ":" + padleftzero(seconds, 2));
  if (countdownTime <= 1800) {
    disableBuyOptions();
  } else {
    enableBuyOptions();
  }
}

function disableBuyOptions() {
  if ($("#countdown_sub").html != "Before the round ends (Betting disallowed)") {
    // Cannot bet anymore for this round, waiting for it to end
    $("#countdown_sub").html("Before the round ends (Betting disallowed)");
    $("#countdown_sub").css("color", "rgb(213,13,3)");
    $("#countdown").css("color", "rgb(213,13,3)");

    // Hide all the options to buy
    $("#call_button").hide();
    $("#call_ticket_container").hide();
    $("#put_button").hide();
    $("#put_ticket_container").hide();
    $("#ticket_div").hide();
  }
}

function enableBuyOptions() {
  if ($("#countdown_sub").html != "Before the round ends") {
    // We can buy
    $("#countdown_sub").html("Before the round ends");
    $("#countdown_sub").css("color", "rgb(50,50,50)");
    $("#countdown").css("color", "rgb(50,50,50)");
    $("#countdown_sub").show();

    $("#call_button").show();
    $("#put_button").show();
    $("#ticket_div").show();
  }
}

function enableCloseOption() {
  disableBuyOptions();
  // If the automated system hasn't shut down the round yet, give the user the option to force it closed
  if ($("#countdown").html != '<span style="text-decoration: underline; cursor: pointer;" onclick="endRound();">End Round</a>') {
    $("#countdown").html('<span style="text-decoration: underline; cursor: pointer;" onclick="endRound();">End Round</a>');
    $("#countdown").css("color", "rgb(50,50,50)");
    $("#countdown_sub").hide();
  }
}

function gotoNextRound() {
  if (roundTransition == true) {
    return;
  }
  if (currentRound < topRound) {
    transitionRoundInformation(currentRound + 1);
  }
}

function gotoPreviousRound() {
  if (roundTransition == true) {
    return;
  }
  if (currentRound > 1) {
    transitionRoundInformation(currentRound - 1);
  }
}

function withdraw() {
  // The user is requesting to withdraw a balance from a round
  var roundBigNum = new BigNumber(currentRound);
  var roundHex = padleftzero(roundBigNum.toString(16), 64); // Convert this number to base 16 (hex) and pad to 64 chars

  const transactionParameters = [{
    to: contractAddress,
    gasPrice: '0x218711A00',
    gas: '0x30D40',
    from: userAddress,
    data: '0x' + contract_withdraw + roundHex
  }];

  sendETHTransaction(transactionParameters);
}

function endRound() {
  // The user is closing the current round by forcing a new round to start
  const transactionParameters = [{
    to: contractAddress,
    gasPrice: '0x218711A00',
    gas: '0x0493E0',
    from: userAddress,
    data: '0x' + contract_startNewRound
  }];

  sendETHTransaction(transactionParameters);
}

function buyTicket(direction) {
  // The user wants to buy a ticket into the market
  var ticket_total = new BigNumber($("#ticket_cost").html());
  var ticket_total_wei = ticket_total.multipliedBy("1000000000000000000"); // Get as wei

  var contract_selected;
  var ticket_count;

  if (direction == 0) {
    // This is a call ticket
    ticket_count = parseInt($("#call_ticket_num").val());
    contract_selected = contract_buyCall;
    $("#call_ticket_container").slideToggle();
  } else {
    // This is a put ticket
    ticket_count = parseInt($("#put_ticket_num").val());
    contract_selected = contract_buyPut;
    $("#put_ticket_container").slideToggle();
  }

  if (ticket_count < 1) {
    return;
  }
  ticket_total_wei = ticket_total_wei.times(ticket_count);

  const transactionParameters = [{
    to: contractAddress,
    gasPrice: '0x218711A00',
    gas: '0x30D40',
    from: userAddress,
    value: ticket_total_wei.toString(16), // Convert to Hex
    data: '0x' + contract_selected
  }];

  sendETHTransaction(transactionParameters);
}

function addHouseFunds(eth_amount) {
  // This function is not used on the front-end but can trigger an amount added to the contract
  var amount_total = new BigNumber(eth_amount);
  var amount_total_wei = amount_total.multipliedBy("1000000000000000000"); // Get as wei

  const transactionParameters = [{
    to: contractAddress,
    gasPrice: '0x218711A00',
    gas: '0x30D40',
    from: userAddress,
    value: amount_total_wei.toString(16), // Convert to Hex
    data: '0x' + contract_addFunds
  }];

  sendETHTransaction(transactionParameters);
}

function sendETHTransaction(transactionParameters) {
  // This is a generic function to send ETH to the contract
  if (ethereum.networkVersion !== targetNetwork) {
    // Not equal to the mainnet, let user know to switch
    alert('This application requires the main network, please switch it in your MetaMask UI.')
    return;
  }

  ethereum.sendAsync({
    method: 'eth_sendTransaction',
    params: transactionParameters,
    from: userAddress
  }, function(err, result) {
    if (!err) {
      if (!result["error"]) {
        console.log("Transaction hash: " + result["result"]);
        statusChanged = true; // Force update of status
      } else {
        console.log("RPC error: " + result["error"]);
      }
    } else {
      console.log("An error occurred while pinging blockchain");
    }
  });
}
