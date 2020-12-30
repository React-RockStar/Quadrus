const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-form-submit");
const loginErrorMsg = document.getElementById("login-error-msg");

// When the login button is clicked, the following code is executed
loginButton.addEventListener("click", (e) => {
    // Prevent the default submission of the form
    e.preventDefault();
    // Get the values input by the user in the form fields
    const username = loginForm.username.value;
    const password = loginForm.password.value;

    var cred = "username="+username+"&password="+password;

    var request = new XMLHttpRequest();
    request.open("POST", "/auth/login", true);
    request.onreadystatechange = function () {
		console.log("answer:",request.status);
        if (request.readyState === 4 && request.status === 200) {
			loginErrorMsg.style.opacity = 0;
            window.location.href="/portal/portal.html";
        } else {
            // Otherwise, make the login error message show (change its oppacity)
            loginErrorMsg.style.opacity = 1;
        }
    };
    request.send(cred);
});
