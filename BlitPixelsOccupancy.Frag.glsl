precision highp float;

varying vec4 OutputColour;


void main()
{
	gl_FragColor = OutputColour;
	
	gl_FragColor.xyz = mix( vec3(0,1,0), vec3(0,0,1), OutputColour.y );
}

