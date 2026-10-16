<?php

namespace App\Http\Controllers;

class LoginController
{
    public function failed()
    {
        return back()->withErrors(['email' => trans('auth.failed')]);
    }
}
