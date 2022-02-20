precision highp float;
varying vec4 FragColour;

uniform bool MuteColour;
uniform bool InvertColour;

uniform sampler2D DepthTexture;
uniform mat4 NormalDepthToViewDepthTransform;
uniform mat4 CameraToWorldTransform;
uniform mat4 ProjectionToCameraTransform;

varying vec3 FragWorldPosition;
varying vec2 FragLocalUv;
varying vec3 FragLocalPosition;
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying vec3 FragWorldNormal;

varying vec3 FragCameraPosition;


const float BorderWidth = 0.08;

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}




void main()
{
	float u = Range( BorderWidth, 1.0 - BorderWidth, FragLocalUv.x ); 
	float v = Range( BorderWidth, 1.0 - BorderWidth, FragLocalUv.y );
	if ( u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0 )
	{
	}
	else
		discard; 
	
	gl_FragColor = vec4(FragLocalUv,0,1.0);
}


